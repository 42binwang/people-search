import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type SamGovIngestInput = {
  /** Searched as a legal business / entity name (SAM is entity-centric). */
  query: string;
  limit?: number;
  apiKey?: string;
};

export type SamGovIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "sam_gov_entity_registrations";
const ENDPOINT = "https://api.sam.gov/entityinfo/v1/entities";

// SAM.gov is entity-centric: it is queried by legal business name, not by
// person name. Its value for people-search is the public points of contact
// (POCs) — named individuals with public email/phone — exposed per registered
// entity. An API key is required (set SAM_GOV_API_KEY). Entity addresses are
// business locations, not residences.
export async function ingestSamGovEntities(
  input: SamGovIngestInput,
): Promise<SamGovIngestResult> {
  registerSamGovSource();

  const limit = clampLimit(input.limit, 100);
  const apiKey = input.apiKey || process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    return { fetched: 0, imported: 0, url: ENDPOINT };
  }

  const url = buildSamUrl({ query: input.query, limit, apiKey });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchSamGovIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SAM.gov request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as SamGovResponse;
  const entities = applyImportLimit(payload.entityData ?? [], limit);
  let imported = 0;

  for (const entity of entities) {
    for (const profile of mapSamGovEntityToProfileInputs(entity)) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return { fetched: entities.length, imported, url };
}

export function registerSamGovSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "SAM.gov Entity Registrations",
    category: "Federal contractor/grantee point of contact",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://sam.gov/data-services",
    notes:
      "Official SAM.gov Data Services (API key required). Entity-centric; named individuals appear only as public points of contact. Use as federal-contracting POC context only; entity address is a business location, not a residence.",
  });
}

export function mapSamGovEntityToProfileInputs(
  entity: SamGovEntity,
): UpsertProfileInput[] {
  const registration = entity.entityRegistration ?? {};
  const core = entity.coreData ?? {};
  const businessName = registration.legalBusinessName ?? "";
  const address = core.physicalAddress ?? {};
  const profiles: UpsertProfileInput[] = [];

  for (const poc of [core.electronicBusinessPoc, core.mailingPoc]) {
    if (!poc?.firstName || !poc?.lastName) {
      continue;
    }
    const fullName = `${poc.firstName} ${poc.lastName}`.trim();
    const recordId = `${businessName}:${fullName}`;
    profiles.push({
      id: `p_sam_gov_${slugify(fullName)}_${slugify(businessName)}`,
      fullName,
      ageRange: "Unknown",
      confidence: "Low",
      aliases: [
        businessName ? `SAM.gov POC for: ${businessName}` : "",
        registration.entityEFTIndicator
          ? `Registration: ${registration.entityEFTIndicator}`
          : "",
        core.registrationExpirationDate
          ? `Registration expires: ${core.registrationExpirationDate}`
          : "",
      ].filter(Boolean),
      locations: [
        {
          city: address.city || "SAM.gov",
          state: address.stateOrProvince || "US",
          kind: "federal contractor business address",
          sourceId,
        },
      ],
      contacts: [
        poc.email
          ? { type: "email" as const, value: poc.email, confidence: "Low" as const, sourceId }
          : null,
        poc.usPhone
          ? { type: "phone" as const, value: poc.usPhone, confidence: "Low" as const, sourceId }
          : null,
      ].filter((contact): contact is NonNullable<typeof contact> => Boolean(contact)),
      relationships: [],
      sourceRecord: {
        sourceId,
        sourceRecordId: recordId,
        raw: entity,
      },
    });
  }

  return profiles;
}

function buildSamUrl(input: {
  query: string;
  limit: number | undefined;
  apiKey: string;
}) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("legalBusinessName", input.query);
  url.searchParams.set("api_key", input.apiKey);
  url.searchParams.set("registrationStatus", "A");
  return url.toString();
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type SamGovResponse = {
  entityData?: SamGovEntity[];
};

export type SamGovEntity = {
  entityRegistration?: {
    legalBusinessName?: string;
    entityEFTIndicator?: string;
  };
  coreData?: {
    physicalAddress?: {
      addressLine1?: string;
      city?: string;
      stateOrProvince?: string;
      zip?: string;
      country?: string;
    };
    registrationExpirationDate?: string;
    electronicBusinessPoc?: SamGovPoc;
    mailingPoc?: SamGovPoc;
  };
};

type SamGovPoc = {
  firstName?: string;
  lastName?: string;
  email?: string;
  usPhone?: string;
};
