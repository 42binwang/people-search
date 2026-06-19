import { XMLParser } from "fast-xml-parser";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OfficialXmlFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type OfficialXmlIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  url: string;
  fields: OfficialXmlFieldMap;
  recordsPath: string;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  queryParam?: string;
  query?: string;
  limitParam?: string;
  limit?: number;
  headers?: Record<string, string>;
};

export type OfficialXmlIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestOfficialXmlRecords(
  input: OfficialXmlIngestInput,
): Promise<OfficialXmlIngestResult> {
  registerOfficialXmlSource(input);

  const limit = clampLimit(input.limit, 5000);
  const url = buildOfficialXmlUrl(input, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/xml,text/xml,*/*;q=0.5",
      "user-agent": "PeopleSearchOfficialXmlIngest/0.1 local-development",
      ...(input.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Official XML request failed: ${response.status} ${response.statusText}`,
    );
  }

  const records = applyImportLimit(
    filterXmlRecordsByQuery(
      extractOfficialXmlRecords(await response.text(), input.recordsPath),
      input,
    ),
    limit,
  );
  let imported = 0;

  for (const record of records) {
    const profile = mapOfficialXmlRecordToProfileInput(record, input);
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

export function registerOfficialXmlSource(input: OfficialXmlIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? input.url,
    notes:
      input.notes ??
      "Official XML API or feed. Use only after confirming this endpoint allows automated access, commercial reuse, and public republication.",
  });
}

export function parseOfficialXmlRecords(text: string, recordsPath: string) {
  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  });

  return extractOfficialXmlRecordsFromPayload(parser.parse(text), recordsPath);
}

export function extractOfficialXmlRecords(
  text: string,
  recordsPath: string,
): OfficialXmlRecord[] {
  return parseOfficialXmlRecords(text, recordsPath);
}

export function extractOfficialXmlRecordsFromPayload(
  payload: unknown,
  recordsPath: string,
): OfficialXmlRecord[] {
  const value = getPathValue(payload, recordsPath);
  const records = Array.isArray(value) ? value : [value];

  return records.filter(isOfficialXmlRecord);
}

export function mapOfficialXmlRecordToProfileInput(
  record: OfficialXmlRecord,
  input: Pick<OfficialXmlIngestInput, "sourceId" | "fields">,
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

function buildOfficialXmlUrl(
  input: OfficialXmlIngestInput,
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

function filterXmlRecordsByQuery(
  records: OfficialXmlRecord[],
  input: Pick<OfficialXmlIngestInput, "fields" | "query" | "queryParam">,
) {
  const tokens = normalizeName(input.query ?? "").split(" ").filter(Boolean);
  if (tokens.length === 0 || input.queryParam) {
    return records;
  }

  return records.filter((record) => {
    const nameParts = normalizeName(clean(getPathValue(record, input.fields.name)))
      .split(" ")
      .filter(Boolean);

    return tokens.every((token) => nameParts.includes(token));
  });
}

function getPathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : current[0];
    }

    if (!isOfficialXmlRecord(current)) {
      return undefined;
    }

    return current[part];
  }, value);
}

function isOfficialXmlRecord(value: unknown): value is OfficialXmlRecord {
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

export type OfficialXmlRecord = Record<string, unknown>;
