import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type ViafIngestInput = {
  query: string;
  limit?: number;
};

export type ViafIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "viaf_authority_search";

export async function ingestViafAuthorityRecords(
  input: ViafIngestInput,
): Promise<ViafIngestResult> {
  registerViafSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildViafSearchUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchViafIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`VIAF request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as ViafSearchResponse;
  const records = applyImportLimit(parseViafRecords(payload), limit);
  let imported = 0;

  for (const record of records) {
    const profile = mapViafRecordToProfileInput(input.query, record);
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

export function registerViafSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "VIAF Authority Search",
    category: "Library authority metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://viaf.org/en/viaf/data",
    notes:
      "VIAF authority search over library authority clusters. Use as catalog/authority context only; headings are not residential, contact, or identity-verification evidence.",
  });
}

export function mapViafRecordToProfileInput(
  query: string,
  record: ViafRecord,
): UpsertProfileInput | null {
  const cluster = record.recordData?.["ns2:VIAFCluster"];
  const heading = extractViafHeading(cluster);
  if (!cluster || !heading || !textMatchesQuery(heading, query)) {
    return null;
  }

  const viafId = getViafText(cluster["ns2:viafID"]) || hashStable(heading);
  const birthDate = getViafText(cluster["ns2:birthDate"]);
  const deathDate = getViafText(cluster["ns2:deathDate"]);
  const nameType = getViafText(cluster["ns2:nameType"]);
  const nationality = getViafText(cluster["ns2:nationalityOfEntity"]);

  return {
    id: `p_viaf_${slugify(viafId)}`,
    fullName: heading,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      `VIAF ID: ${viafId}`,
      nameType ? `Name type: ${nameType}` : "",
      nationality ? `Nationality metadata: ${nationality}` : "",
      birthDate ? `Birth date metadata: ${birthDate}` : "",
      deathDate ? `Death date metadata: ${deathDate}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: "VIAF",
        state: "Global",
        kind: "library authority metadata",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: viafId,
      raw: record,
    },
  };
}

export function parseViafRecords(value: ViafSearchResponse): ViafRecord[] {
  const records = value.searchRetrieveResponse?.records;
  const recordValue = records?.record;
  if (!recordValue) {
    return [];
  }

  return toArray(recordValue).filter(isViafRecord);
}

function buildViafSearchUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://viaf.org/viaf/search");
  url.searchParams.set("query", `local.names all "${input.query}"`);
  if (input.limit) {
    url.searchParams.set("maximumRecords", String(input.limit));
  }
  return url.toString();
}

function extractViafHeading(cluster: ViafCluster | undefined) {
  if (!cluster) {
    return "";
  }

  const headingText = firstNestedText(cluster["ns2:mainHeadings"], "ns2:text");
  if (headingText) {
    return cleanViafHeading(headingText);
  }

  const subfieldText = collectSubfieldContent(cluster["ns2:mainHeadings"]);
  return cleanViafHeading(subfieldText.join(" "));
}

function cleanViafHeading(value: string) {
  return value.split("|")[0]?.replace(/\s+/g, " ").trim() ?? "";
}

function firstNestedText(value: unknown, key: string): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  if (!Array.isArray(value) && key in value) {
    const text = getViafText((value as Record<string, unknown>)[key]);
    if (text) {
      return text;
    }
  }

  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const text = firstNestedText(child, key);
    if (text) {
      return text;
    }
  }

  return "";
}

function collectSubfieldContent(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const values: string[] = [];
  if (!Array.isArray(value) && "ns2:subfield" in value) {
    for (const subfield of toArray((value as Record<string, unknown>)["ns2:subfield"])) {
      if (subfield && typeof subfield === "object") {
        const content = getViafText((subfield as Record<string, unknown>).content);
        if (content) {
          values.push(content);
        }
      }
    }
  }

  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    values.push(...collectSubfieldContent(child));
  }

  return values;
}

function getViafText(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return getViafText((value as Record<string, unknown>).content);
  }
  return "";
}

function textMatchesQuery(text: string, query: string) {
  const textNorm = normalizeName(text);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => textNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

function hashStable(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function toArray<T>(value: T | T[]) {
  return Array.isArray(value) ? value : [value];
}

function isViafRecord(value: unknown): value is ViafRecord {
  return Boolean(value && typeof value === "object" && "recordData" in value);
}

export type ViafSearchResponse = {
  searchRetrieveResponse?: {
    records?: {
      record?: ViafRecord | ViafRecord[];
    };
  };
};

export type ViafRecord = {
  recordData?: {
    "ns2:VIAFCluster"?: ViafCluster;
  };
};

type ViafCluster = Record<string, unknown>;
