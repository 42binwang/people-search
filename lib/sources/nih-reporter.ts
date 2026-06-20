import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type NihReporterIngestInput = {
  query: string;
  limit?: number;
};

export type NihReporterIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "nih_reporter";

export async function ingestNihReporterProjects(
  input: NihReporterIngestInput,
): Promise<NihReporterIngestResult> {
  registerNihReporterSource();

  const limit = clampLimit(input.limit, 100);
  const url = "https://api.reporter.nih.gov/v2/projects/search";
  const { firstName, lastName } = splitQueryName(input.query);
  if (!lastName) {
    return { fetched: 0, imported: 0, url };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "PeopleSearchNihReporterIngest/0.1 local-development",
    },
    body: JSON.stringify({
      criteria: { pi_names: [{ last_name: lastName, first_name: firstName }] },
      offset: 0,
      limit,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `NIH RePORTER search failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as NihReporterSearchResponse;
  const projects = applyImportLimit(payload.results ?? [], limit);
  let imported = 0;

  for (const project of projects) {
    for (const profile of mapNihProjectToProfileInputs(input.query, project)) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return { fetched: projects.length, imported, url };
}

export function registerNihReporterSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "NIH RePORTER",
    category: "Federal research grant principal investigator",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://api.reporter.nih.gov/",
    notes:
      "Official NIH RePORTER API. Use as federal research grant context only; institution/work address is not residential or contact evidence.",
  });
}

export function mapNihProjectToProfileInputs(
  query: string,
  project: NihReporterProject,
): UpsertProfileInput[] {
  const investigators = project.principal_investigators ?? [];
  if (investigators.length === 0 || !project.appl_id) {
    return [];
  }

  const title = project.project_title || "Untitled NIH project";
  const org = project.organization ?? {};
  const institution = [org.org_name, org.org_city, org.org_state]
    .filter(Boolean)
    .join(", ");

  return investigators
    .filter((pi) => nameMatchesQuery(piFullName(pi), query))
    .map((pi, index) => ({
      id: `p_nih_reporter_${slugify(piFullName(pi))}_${project.appl_id}_${index}`,
      fullName: cleanName(piFullName(pi)),
      ageRange: "Unknown",
      confidence: "Low",
      aliases: [
        `NIH project: ${title}`,
        project.project_num ? `Project number: ${project.project_num}` : "",
        project.agency_code ? `Funding agency: ${project.agency_code}` : "",
        project.fiscal_year ? `Fiscal year: ${project.fiscal_year}` : "",
        project.award_amount
          ? `Award amount: $${Number(project.award_amount).toLocaleString()}`
          : "",
        institution ? `Institution: ${institution}` : "",
      ].filter(Boolean),
      locations: [
        {
          city: "NIH RePORTER",
          state: "Global",
          kind: "federal research grant affiliation",
          sourceId,
        },
      ],
      contacts: [],
      relationships: [],
      sourceRecord: {
        sourceId,
        sourceRecordId: `${project.appl_id}:${index}`,
        raw: { project, matchedInvestigator: pi },
      },
    }));
}

function splitQueryName(query: string) {
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return { firstName: "", lastName: "" };
  }
  const lastName = tokens[tokens.length - 1];
  const firstName = tokens.slice(0, -1).join(" ");
  return { firstName, lastName };
}

function piFullName(pi: NihReporterInvestigator) {
  return pi.full_name || [pi.first_name, pi.last_name].filter(Boolean).join(" ");
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type NihReporterSearchResponse = {
  meta?: { total?: number };
  results?: NihReporterProject[];
};

export type NihReporterProject = {
  appl_id?: string;
  project_num?: string;
  project_title?: string;
  fiscal_year?: string | number;
  award_amount?: string | number;
  agency_code?: string;
  organization?: {
    org_name?: string;
    org_city?: string;
    org_state?: string;
    org_country?: string;
  };
  principal_investigators?: NihReporterInvestigator[];
};

type NihReporterInvestigator = {
  profile_id?: number;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  full_name?: string;
  is_contact_pi?: boolean;
};
