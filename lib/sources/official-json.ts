import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OfficialJsonFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type OfficialJsonIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  url: string;
  fields: OfficialJsonFieldMap;
  recordsPath?: string;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  queryParam?: string;
  query?: string;
  limitParam?: string;
  limit?: number;
  headers?: Record<string, string>;
};

export type OfficialJsonIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestOfficialJsonRecords(
  input: OfficialJsonIngestInput,
): Promise<OfficialJsonIngestResult> {
  registerOfficialJsonSource(input);

  const limit = clampLimit(input.limit, 5000);
  const url = buildOfficialJsonUrl(input, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchOfficialJsonIngest/0.1 local-development",
      ...(input.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Official JSON request failed: ${response.status} ${response.statusText}`,
    );
  }

  const records = applyImportLimit(
    extractOfficialJsonRecords(await response.json(), input.recordsPath),
    limit,
  );
  let imported = 0;

  for (const record of records) {
    const profile = mapOfficialJsonRecordToProfileInput(record, input);
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

export function registerOfficialJsonSource(input: OfficialJsonIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? input.url,
    notes:
      input.notes ??
      "Official JSON API endpoint. Use only after confirming this endpoint allows automated access, commercial reuse, and public republication.",
  });
}

export function mapOfficialJsonRecordToProfileInput(
  record: OfficialJsonRecord,
  input: Pick<OfficialJsonIngestInput, "sourceId" | "fields">,
): UpsertProfileInput | null {
  const fields = input.fields;
  const fullName = clean(getPathValue(record, fields.name));
  const city = clean(getPathValue(record, fields.city));
  const state = clean(getPathValue(record, fields.state)).toUpperCase();
  const recordId = clean(getPathValue(record, fields.recordId));

  if (!fullName || !city || !state || !recordId) {
    return null;
  }

  return {
    id: `p_${slugify(input.sourceId)}_${slugify(recordId)}`,
    fullName: titleCaseName(fullName),
    ageRange: "Unknown",
    confidence: "Medium",
    aliases: [
      fields.updatedAt && clean(getPathValue(record, fields.updatedAt))
        ? `Source updated: ${clean(getPathValue(record, fields.updatedAt))}`
        : "",
    ].filter(Boolean),
    locations: [
      {
        street: fields.street
          ? clean(getPathValue(record, fields.street))
          : undefined,
        city: titleCaseName(city),
        state,
        zip: fields.zip ? clean(getPathValue(record, fields.zip)) : undefined,
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

export function extractOfficialJsonRecords(
  payload: unknown,
  recordsPath?: string,
): OfficialJsonRecord[] {
  const value = recordsPath ? getPathValue(payload, recordsPath) : payload;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isOfficialJsonRecord);
}

function buildOfficialJsonUrl(
  input: OfficialJsonIngestInput,
  limit: number | undefined,
) {
  const url = new URL(input.url);

  if (input.query && input.queryParam) {
    url.searchParams.set(input.queryParam, input.query);
  }
  if (limit && input.limitParam) {
    url.searchParams.set(input.limitParam, String(limit));
  }

  return url.toString();
}

function getPathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!isOfficialJsonRecord(current)) {
      return undefined;
    }
    return current[part];
  }, value);
}

function isOfficialJsonRecord(value: unknown): value is OfficialJsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

export type OfficialJsonRecord = Record<string, unknown>;
