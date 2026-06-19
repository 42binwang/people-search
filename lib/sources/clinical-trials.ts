import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type ClinicalTrialsIngestInput = {
  query: string;
  limit?: number;
};

export type ClinicalTrialsIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "clinicaltrials_gov_studies";

export async function ingestClinicalTrialsPersonnel(
  input: ClinicalTrialsIngestInput,
): Promise<ClinicalTrialsIngestResult> {
  registerClinicalTrialsSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildClinicalTrialsUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchClinicalTrialsIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `ClinicalTrials.gov request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as ClinicalTrialsResponse;
  const studies = applyImportLimit(payload.studies ?? [], limit);
  let imported = 0;

  for (const study of studies) {
    const profiles = mapClinicalTrialStudyToProfileInputs(input.query, study);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: studies.length,
    imported,
    url,
  };
}

export function registerClinicalTrialsSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "ClinicalTrials.gov API v2",
    category: "Clinical trial personnel",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://clinicaltrials.gov/data-api/api",
    notes:
      "Official ClinicalTrials.gov API. Use named study personnel as clinical research context only; not residential data.",
  });
}

export function mapClinicalTrialStudyToProfileInputs(
  query: string,
  study: ClinicalTrialStudy,
): UpsertProfileInput[] {
  const identification = study.protocolSection?.identificationModule;
  const contacts = study.protocolSection?.contactsLocationsModule;
  const nctId = identification?.nctId;
  const title = identification?.briefTitle || identification?.officialTitle;

  if (!nctId || !title || !contacts) {
    return [];
  }

  const people: ClinicalTrialMatchedPerson[] = [];
  const addPerson = (person: ClinicalTrialMaybePerson) => {
    if (person.name && nameMatchesQuery(person.name, query)) {
      people.push({
        ...person,
        name: person.name,
      });
    }
  };

  for (const person of contacts.overallOfficials ?? []) {
    addPerson({
      name: person.name,
      role: person.role,
      affiliation: person.affiliation,
    });
  }

  for (const person of contacts.centralContacts ?? []) {
    addPerson({
      name: person.name,
      role: person.role,
      phone: person.phone,
      email: person.email,
    });
  }

  for (const location of contacts.locations ?? []) {
    for (const person of location.contacts ?? []) {
      addPerson({
        name: person.name,
        role: person.role,
        affiliation: location.facility,
        location,
        phone: person.phone,
        email: person.email,
      });
    }
  }

  const seen = new Set<string>();

  return people.flatMap((person, index) => {
    const key = `${normalizeName(person.name)}:${person.role ?? ""}:${nctId}`;
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);

    const fullName = titleCaseName(person.name);
    const location = person.location;
    const affiliation = person.affiliation;

    return [
      {
        id: `p_ctgov_${nctId}_${slugify(fullName)}_${index}`,
        fullName,
        ageRange: "Unknown",
        confidence: "Medium",
        aliases: [
          `Clinical trial: ${title}`,
          `NCT ID: ${nctId}`,
          person.role ? `Role: ${person.role}` : "",
          affiliation ? `Affiliation: ${affiliation}` : "",
        ].filter(Boolean),
        locations: location
          ? [
              {
                city: location.city || location.facility || "ClinicalTrials.gov",
                state: location.state || location.country || "Global",
                zip: location.zip,
                kind: "clinical trial site",
                sourceId,
              },
            ]
          : affiliation
            ? [
                {
                  city: affiliation,
                  state: "Global",
                  kind: "clinical trial affiliation",
                  sourceId,
                },
              ]
            : [
                {
                  city: "ClinicalTrials.gov",
                  state: "Global",
                  kind: "clinical trial personnel",
                  sourceId,
                },
              ],
        contacts: [
          person.phone
            ? {
                type: "phone" as const,
                value: person.phone,
                confidence: "Medium",
                sourceId,
              }
            : null,
          person.email
            ? {
                type: "email" as const,
                value: person.email,
                confidence: "Medium",
                sourceId,
              }
            : null,
        ].filter((contact): contact is NonNullable<typeof contact> =>
          Boolean(contact),
        ),
        relationships: [],
        sourceRecord: {
          sourceId,
          sourceRecordId: `${nctId}:${index}:${fullName}`,
          raw: {
            study,
            matchedPerson: person,
          },
        },
      },
    ];
  });
}

function buildClinicalTrialsUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("query.term", input.query);
  if (input.limit) {
    url.searchParams.set("pageSize", String(input.limit));
  }
  url.searchParams.set("format", "json");
  return url.toString();
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bMd\b/g, "MD")
    .replace(/\bPhd\b/g, "PhD")
    .trim();
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type ClinicalTrialsResponse = {
  studies?: ClinicalTrialStudy[];
};

export type ClinicalTrialStudy = {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
    };
    contactsLocationsModule?: {
      centralContacts?: Array<ClinicalTrialPersonContact>;
      overallOfficials?: Array<{
        name?: string;
        role?: string;
        affiliation?: string;
      }>;
      locations?: Array<ClinicalTrialLocation>;
    };
  };
};

type ClinicalTrialPersonContact = {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
};

type ClinicalTrialLocation = {
  facility?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  contacts?: Array<ClinicalTrialPersonContact>;
};

type ClinicalTrialMatchedPerson = {
  name: string;
  role?: string;
  affiliation?: string;
  location?: ClinicalTrialLocation;
  phone?: string;
  email?: string;
};

type ClinicalTrialMaybePerson = Omit<ClinicalTrialMatchedPerson, "name"> & {
  name?: string;
};
