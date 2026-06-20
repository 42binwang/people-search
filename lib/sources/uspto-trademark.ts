import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type UsptoTrademarkIngestInput = {
  query: string;
  limit?: number;
  apiKey?: string;
};

export type UsptoTrademarkIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "uspto_trademark_owners";
const ENDPOINT = "https://api.uspto.gov/api/v1/trademark/search";

// USPTO Open Data Portal trademark search (API key required — set
// USPTO_API_KEY). A trademark owner/applicant name + correspondence address
// is public record, but it is not a residence. Live verification requires a
// key; confirm the response shape against the current ODP schema before bulk
// use.
export async function ingestUsptoTrademarkOwners(
  input: UsptoTrademarkIngestInput,
): Promise<UsptoTrademarkIngestResult> {
  registerUsptoTrademarkSource();

  const limit = clampLimit(input.limit, 100);
  const apiKey = input.apiKey || process.env.USPTO_API_KEY;
  if (!apiKey) {
    return {
      fetched: 0,
      imported: 0,
      url: ENDPOINT,
    };
  }

  const url = buildUsptoUrl({ query: input.query, limit, apiKey });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchUsptoTrademarkIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `USPTO trademark request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as unknown;
  const records = applyImportLimit(extractTrademarkRecords(payload), limit);
  let imported = 0;

  for (const record of records) {
    const profile = mapUsptoTrademarkToProfileInput(input.query, record);
    if (profile) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return { fetched: records.length, imported, url };
}

export function registerUsptoTrademarkSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "USPTO Trademark Owners",
    category: "Federal trademark owner/applicant",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://data.uspto.gov/",
    notes:
      "Official USPTO Open Data Portal trademark search (API key required). Use as federal trademark owner/applicant context only; owner/correspondence address is not residential evidence.",
  });
}

export function mapUsptoTrademarkToProfileInput(
  query: string,
  record: UsptoTrademarkRecord,
): UpsertProfileInput | null {
  const fullName = cleanName(record.ownerName);
  const recordId = record.registrationNumber || record.serialNumber;
  if (!fullName || !recordId || !nameMatchesQuery(fullName, query)) {
    return null;
  }

  return {
    id: `p_uspto_trademark_${slugify(fullName)}_${recordId}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      record.markDescription ? `Trademark: ${record.markDescription}` : "",
      record.registrationNumber
        ? `Registration number: ${record.registrationNumber}`
        : "",
      record.serialNumber ? `Serial number: ${record.serialNumber}` : "",
      record.status ? `Status: ${record.status}` : "",
      record.filingDate ? `Filing date: ${record.filingDate}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: record.ownerCity || "USPTO",
        state: record.ownerState || "US",
        street: record.ownerAddress1,
        zip: record.ownerPostalCode,
        kind: "trademark owner/correspondence address",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: String(recordId),
      raw: record,
    },
  };
}

function buildUsptoUrl(input: {
  query: string;
  limit: number | undefined;
  apiKey: string;
}) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("query", input.query);
  url.searchParams.set("searchType", "owner");
  url.searchParams.set("rows", String(input.limit));
  url.searchParams.set("api_key", input.apiKey);
  return url.toString();
}

function extractTrademarkRecords(payload: unknown): UsptoTrademarkRecord[] {
  if (Array.isArray(payload)) {
    return payload as UsptoTrademarkRecord[];
  }
  const obj = (payload ?? {}) as Record<string, unknown>;
  for (const key of ["items", "results", "trademarks"]) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value as UsptoTrademarkRecord[];
    }
  }
  return [];
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function cleanName(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

export type UsptoTrademarkRecord = {
  ownerName?: string;
  ownerAddress1?: string;
  ownerCity?: string;
  ownerState?: string;
  ownerPostalCode?: string;
  ownerCountry?: string;
  markDescription?: string;
  registrationNumber?: string;
  serialNumber?: string;
  status?: string;
  filingDate?: string;
};
