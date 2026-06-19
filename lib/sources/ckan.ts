import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type CkanFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type CkanIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  portalUrl: string;
  resourceId: string;
  fields: CkanFieldMap;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  query?: string;
  filters?: Record<string, string>;
  limit?: number;
};

export type CkanIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestCkanDataStore(
  input: CkanIngestInput,
): Promise<CkanIngestResult> {
  registerCkanSource(input);

  const limit = clampLimit(input.limit, 5000);
  const url = buildCkanDataStoreUrl(input, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchCkanIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `CKAN request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as CkanDataStoreResponse;
  if (!payload.success) {
    throw new Error(
      `CKAN request failed: ${payload.error?.message ?? "unknown error"}`,
    );
  }

  const records = applyImportLimit(payload.result?.records ?? [], limit);
  let imported = 0;

  for (const record of records) {
    const profile = mapCkanRecordToProfileInput(record, input);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: records.length,
    imported,
    url,
  };
}

export function registerCkanSource(input: CkanIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? input.portalUrl,
    notes:
      input.notes ??
      "Official CKAN DataStore API. Use only after confirming this resource allows automated access, commercial reuse, and public republication.",
  });
}

export function mapCkanRecordToProfileInput(
  record: CkanRecord,
  input: Pick<CkanIngestInput, "sourceId" | "fields">,
): UpsertProfileInput | null {
  const fields = input.fields;
  const fullName = clean(record[fields.name]);
  const city = clean(record[fields.city]);
  const state = clean(record[fields.state]).toUpperCase();
  const recordId = clean(record[fields.recordId]);

  if (!fullName || !city || !state || !recordId) {
    return null;
  }

  return {
    id: `p_${slugify(input.sourceId)}_${slugify(recordId)}`,
    fullName: titleCaseName(fullName),
    ageRange: "Unknown",
    confidence: "Medium",
    aliases: [
      fields.updatedAt && clean(record[fields.updatedAt])
        ? `Source updated: ${clean(record[fields.updatedAt])}`
        : "",
    ].filter(Boolean),
    locations: [
      {
        street: fields.street ? clean(record[fields.street]) : undefined,
        city: titleCaseName(city),
        state,
        zip: fields.zip ? clean(record[fields.zip]) : undefined,
        kind: "public property record",
        sourceId: input.sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId: input.sourceId,
      sourceRecordId: recordId,
      raw: record,
    },
  };
}

function buildCkanDataStoreUrl(input: CkanIngestInput, limit: number | undefined) {
  const url = new URL(
    `${input.portalUrl.replace(/\/+$/, "")}/api/3/action/datastore_search`,
  );
  url.searchParams.set("resource_id", input.resourceId);

  if (input.query) {
    url.searchParams.set("q", input.query);
  }
  if (input.filters && Object.keys(input.filters).length > 0) {
    url.searchParams.set("filters", JSON.stringify(input.filters));
  }
  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  return url.toString();
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bLlc\b/g, "LLC")
    .replace(/\bInc\b/g, "Inc")
    .trim();
}

function slugify(value: string) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "_") || "unknown";
}

export type CkanRecord = Record<string, unknown>;

type CkanDataStoreResponse = {
  success: boolean;
  result?: {
    records?: CkanRecord[];
  };
  error?: {
    message?: string;
  };
};
