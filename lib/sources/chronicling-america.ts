import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import {
  normalizedNameMatchesTokens,
  tokenizeName,
} from "@/lib/name-search";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

/**
 * Chronicling America (Library of Congress) — public, no key. As of 2025 the
 * legacy chroniclingamerica.loc.gov search API was retired and the collection
 * is accessed through the loc.gov API (`fo=json`). We full-text search the OCR
 * of historic US newspaper pages for a person's name and create one context
 * profile per name that survives strict token filtering, keeping one
 * representative newspaper clipping (newspaper title + date + publication city/
 * state) per profile.
 *
 * IMPORTANT: historic-newspaper OCR matches are weak evidence. A page match
 * only means the name appeared somewhere in the OCR text of that page; it is
 * not identity verification, not a residence, and not proof the named person
 * is the subject. Locations here are newspaper publication context, not the
 * person's residence.
 */

export type ChroniclingAmericaIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type ChroniclingAmericaIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "chronicling_america_obituaries";
const CA_SEARCH_URL =
  "https://www.loc.gov/collections/chronicling-america/?fo=json";

export async function ingestChroniclingAmerica(
  input: ChroniclingAmericaIngestInput,
): Promise<ChroniclingAmericaIngestResult> {
  registerChroniclingAmericaSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;
  const fullName = [first, last].filter(Boolean).join(" ").trim();

  if (!fullName) {
    return { fetched: 0, imported: 0, url: CA_SEARCH_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildSearchUrl(fullName, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchChroniclingAmericaIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Chronicling America request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as ChroniclingAmericaResponse;
  const items = applyImportLimit(payload.results ?? [], limit);
  const requiredTokens = uniqueTokens(fullName);

  const profilesByName = new Map<string, UpsertProfileInput>();
  for (const item of items) {
    if (!nameInOcr(item, requiredTokens)) {
      continue;
    }
    const key = normalizeKey(fullName);
    if (profilesByName.has(key)) {
      continue;
    }
    const profile = mapChroniclingAmericaItemToProfileInput(item, fullName);
    if (profile) {
      profilesByName.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByName.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: items.length, imported, url };
}

export function registerChroniclingAmericaSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Chronicling America Historic Newspaper Search",
    category: "Historic newspaper mention",
    jurisdiction: "US",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.loc.gov/collections/chronicling-america/about-this-collection/",
    notes:
      "Official Library of Congress loc.gov API (fo=json) for the Chronicling America historic newspaper collection (approx. 1758-1963). OCR full-text match only; a newspaper page match is weak evidence that is not identity verification, not a residence, and not proof the named person is the subject. Locations are newspaper publication context, not the person's residence.",
  });
}

export function mapChroniclingAmericaItemToProfileInput(
  item: ChroniclingAmericaItem,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const newspaperTitle = cleanNewspaperTitle(item);
  const date = item.date;
  const city = firstValue(item.location_city);
  const state = firstValue(item.location_state);

  const aliases = [newspaperTitle, date].filter(
    (value): value is string => Boolean(value),
  );

  const locations =
    city || state
      ? [
          {
            city: city || newspaperTitle || "Unknown",
            state: state || "US",
            kind: "publication context",
            sourceId,
          },
        ]
      : [];

  const recordId = `${normalizeKey(item.id || "page")}__${normalizeKey(fullName)}`;

  return {
    id: `p_chroniclingamerica_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Low",
    aliases,
    locations,
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: { item, matchedName: fullName },
    },
  };
}

function buildSearchUrl(query: string, limit: number | undefined) {
  const url = new URL(CA_SEARCH_URL);
  // Full-text search across OCR of historic newspaper pages for the name.
  url.searchParams.set("q", query);
  if (typeof limit === "number") {
    url.searchParams.set("c", String(limit));
  }
  return url.toString();
}

function nameInOcr(
  item: ChroniclingAmericaItem,
  requiredTokens: string[],
): boolean {
  if (requiredTokens.length === 0) {
    return false;
  }
  const haystack = ocrText(item);
  return normalizedNameMatchesTokens(haystack, requiredTokens);
}

function ocrText(item: ChroniclingAmericaItem): string {
  const desc = item.description;
  if (Array.isArray(desc)) {
    return desc.join(" ");
  }
  return (desc ?? "") + " " + (item.title ?? "");
}

function cleanNewspaperTitle(item: ChroniclingAmericaItem): string {
  const partof = item.partof_title;
  const partofValue = Array.isArray(partof) ? partof[0] : partof;
  if (partofValue && typeof partofValue === "string") {
    return partofValue;
  }
  const title = item.title ?? "";
  return title.replace(/^Image \d+ of\s*/i, "").trim();
}

function firstValue(value: string[] | string | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function splitQuery(query: string | undefined): { first: string; last: string } {
  const tokens = tokenizeName(query ?? "");
  if (tokens.length === 0) {
    return { first: "", last: "" };
  }
  if (tokens.length === 1) {
    return { first: "", last: tokens[0] };
  }
  return { first: tokens[0], last: tokens.slice(1).join(" ") };
}

function normalizeKey(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function uniqueTokens(value: string): string[] {
  return Array.from(new Set(tokenizeName(value)));
}

export type ChroniclingAmericaItem = {
  id?: string;
  title?: string;
  date?: string;
  dates?: string[];
  description?: string[] | string;
  location_city?: string[] | string;
  location_state?: string[] | string;
  location_country?: string[] | string;
  location_county?: string[] | string;
  partof_title?: string[] | string;
  number_lccn?: string[];
  language?: string[];
  segmentof?: string;
};

type ChroniclingAmericaResponse = {
  results?: ChroniclingAmericaItem[];
  pagination?: {
    total?: number;
    results?: number;
  };
};
