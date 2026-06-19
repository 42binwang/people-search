import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type SocrataFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type SocrataIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  domain: string;
  datasetId: string;
  fields: SocrataFieldMap;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  query?: string;
  where?: string;
  limit?: number;
};

export type SocrataIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestSocrataOpenData(
  input: SocrataIngestInput,
): Promise<SocrataIngestResult> {
  registerSocrataSource(input);

  const limit = clampLimit(input.limit, 5000);
  const url = buildSocrataUrl(input, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchSocrataIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Socrata request failed: ${response.status} ${response.statusText}`,
    );
  }

  const rows = applyImportLimit(((await response.json()) as SocrataRow[]) ?? [], limit);
  let imported = 0;

  for (const row of rows) {
    const profile = mapSocrataRowToProfileInput(row, input);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: rows.length,
    imported,
    url,
  };
}

export function registerSocrataSource(input: SocrataIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? `https://${input.domain}`,
    notes:
      input.notes ??
      "Official Socrata/SODA open-data API. Use only after confirming this dataset allows commercial reuse and public republication.",
  });
}

export function mapSocrataRowToProfileInput(
  row: SocrataRow,
  input: Pick<SocrataIngestInput, "sourceId" | "fields">,
): UpsertProfileInput | null {
  const fields = input.fields;
  const fullName = clean(row[fields.name]);
  const city = clean(row[fields.city]);
  const state = clean(row[fields.state]).toUpperCase();
  const recordId = clean(row[fields.recordId]);

  if (!fullName || !city || !state || !recordId) {
    return null;
  }

  return {
    id: `p_${slugify(input.sourceId)}_${slugify(recordId)}`,
    fullName: titleCaseName(fullName),
    ageRange: "Unknown",
    confidence: "Medium",
    aliases: [
      fields.updatedAt && clean(row[fields.updatedAt])
        ? `Source updated: ${clean(row[fields.updatedAt])}`
        : "",
    ].filter(Boolean),
    locations: [
      {
        street: fields.street ? clean(row[fields.street]) : undefined,
        city: titleCaseName(city),
        state,
        zip: fields.zip ? clean(row[fields.zip]) : undefined,
        kind: "public property record",
        sourceId: input.sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId: input.sourceId,
      sourceRecordId: recordId,
      raw: row,
    },
  };
}

function buildSocrataUrl(input: SocrataIngestInput, limit: number | undefined) {
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = new URL(`https://${domain}/resource/${input.datasetId}.json`);
  const selectFields = unique([
    input.fields.recordId,
    input.fields.name,
    input.fields.street,
    input.fields.city,
    input.fields.state,
    input.fields.zip,
    input.fields.updatedAt,
  ]);

  url.searchParams.set("$select", selectFields.join(","));
  if (input.query) {
    url.searchParams.set("$q", input.query);
  }
  if (input.where) {
    url.searchParams.set("$where", input.where);
  }
  if (limit) {
    url.searchParams.set("$limit", String(limit));
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

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export type SocrataRow = Record<string, unknown>;
