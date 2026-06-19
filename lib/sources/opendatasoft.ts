import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OpendatasoftFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type OpendatasoftIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  domain: string;
  datasetId: string;
  fields: OpendatasoftFieldMap;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  query?: string;
  where?: string;
  limit?: number;
  apiKey?: string;
};

export type OpendatasoftIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestOpendatasoftRecords(
  input: OpendatasoftIngestInput,
): Promise<OpendatasoftIngestResult> {
  registerOpendatasoftSource(input);

  const limit = clampLimit(input.limit, 100);
  const url = buildOpendatasoftRecordsUrl(input, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchOpendatasoftIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Opendatasoft request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as OpendatasoftRecordsResponse;
  const records = applyImportLimit(payload.results ?? [], limit);
  let imported = 0;

  for (const record of records) {
    const profile = mapOpendatasoftRecordToProfileInput(record, input);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: records.length,
    imported,
    url: redactApiKey(url),
  };
}

export function registerOpendatasoftSource(input: OpendatasoftIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? `https://${input.domain}`,
    notes:
      input.notes ??
      "Official Opendatasoft Explore API. Use only after confirming this dataset allows automated access, commercial reuse, and public republication.",
  });
}

export function mapOpendatasoftRecordToProfileInput(
  record: OpendatasoftRecord,
  input: Pick<OpendatasoftIngestInput, "sourceId" | "fields">,
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

function buildOpendatasoftRecordsUrl(
  input: OpendatasoftIngestInput,
  limit: number | undefined,
) {
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = new URL(
    `https://${domain}/api/explore/v2.1/catalog/datasets/${input.datasetId}/records`,
  );
  const selectedFields = unique([
    input.fields.recordId,
    input.fields.name,
    input.fields.street,
    input.fields.city,
    input.fields.state,
    input.fields.zip,
    input.fields.updatedAt,
  ]);

  url.searchParams.set("select", selectedFields.join(","));
  if (input.query) {
    url.searchParams.set("q", input.query);
  }
  if (input.where) {
    url.searchParams.set("where", input.where);
  }
  if (limit) {
    url.searchParams.set("limit", String(limit));
  }
  if (input.apiKey) {
    url.searchParams.set("apikey", input.apiKey);
  }

  return url.toString();
}

function redactApiKey(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("apikey")) {
    parsed.searchParams.set("apikey", "REDACTED");
  }
  return parsed.toString();
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

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export type OpendatasoftRecord = Record<string, unknown>;

type OpendatasoftRecordsResponse = {
  results?: OpendatasoftRecord[];
};
