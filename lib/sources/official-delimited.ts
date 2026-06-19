import { parse } from "csv-parse/sync";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OfficialDelimitedFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type OfficialDelimitedIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  url: string;
  fields: OfficialDelimitedFieldMap;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  delimiter?: "," | "\t" | "|" | ";";
  query?: string;
  limit?: number;
  headers?: Record<string, string>;
};

export type OfficialDelimitedIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestOfficialDelimitedRecords(
  input: OfficialDelimitedIngestInput,
): Promise<OfficialDelimitedIngestResult> {
  registerOfficialDelimitedSource(input);

  const limit = clampLimit(input.limit, 5000);
  const response = await fetch(input.url, {
    headers: {
      accept: "text/csv,text/tab-separated-values,text/plain,*/*;q=0.5",
      "user-agent": "PeopleSearchOfficialDelimitedIngest/0.1 local-development",
      ...(input.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Official delimited request failed: ${response.status} ${response.statusText}`,
    );
  }

  const rows = applyImportLimit(
    filterDelimitedRowsByQuery(
      parseOfficialDelimitedRecords(await response.text(), input.delimiter),
      input,
    ),
    limit,
  );
  let imported = 0;

  for (const row of rows) {
    const profile = mapOfficialDelimitedRowToProfileInput(row, input);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: rows.length,
    imported,
    url: input.url,
  };
}

export function registerOfficialDelimitedSource(input: OfficialDelimitedIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "bulk_file",
    licenseUrl: input.licenseUrl ?? input.url,
    notes:
      input.notes ??
      "Official delimited bulk file. Use only after confirming this file allows automated access, commercial reuse, and public republication.",
  });
}

export function parseOfficialDelimitedRecords(
  text: string,
  delimiter: OfficialDelimitedIngestInput["delimiter"] = ",",
): OfficialDelimitedRow[] {
  return parse(text, {
    bom: true,
    columns: true,
    delimiter,
    skip_empty_lines: true,
    trim: true,
  }) as OfficialDelimitedRow[];
}

export function mapOfficialDelimitedRowToProfileInput(
  row: OfficialDelimitedRow,
  input: Pick<OfficialDelimitedIngestInput, "sourceId" | "fields">,
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

function filterDelimitedRowsByQuery(
  rows: OfficialDelimitedRow[],
  input: Pick<OfficialDelimitedIngestInput, "fields" | "query">,
) {
  const tokens = normalizeName(input.query ?? "").split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    const name = normalizeName(clean(row[input.fields.name]));
    return tokens.every((token) => name.includes(token));
  });
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

export type OfficialDelimitedRow = Record<string, string>;
