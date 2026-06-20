import {
  isPersonLikeSearchName,
  tokenizeName,
} from "@/lib/name-search";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type LibraryOfCongressIngestInput = {
  query: string;
  limit?: number;
};

export type LibraryOfCongressIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "library_of_congress_search";

export async function ingestLibraryOfCongressSearch(
  input: LibraryOfCongressIngestInput,
): Promise<LibraryOfCongressIngestResult> {
  registerLibraryOfCongressSource();

  const limit = clampLimit(input.limit, 20);
  const url = buildLibraryOfCongressUrl(input.query);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchLocIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Library of Congress request failed: ${response.status} ${response.statusText}`,
    );
  }

  const entries = applyImportLimit(
    parseLibraryOfCongressSearch(await response.json()),
    limit,
  );
  let imported = 0;

  for (const entry of entries) {
    const profile = mapLibraryOfCongressEntryToProfileInput(input.query, entry);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: entries.length,
    imported,
    url,
  };
}

export function registerLibraryOfCongressSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Library of Congress Linked Data Search",
    category: "Library of Congress authority/catalog metadata",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://id.loc.gov/techcenter/searching.html",
    notes:
      "Library of Congress id.loc.gov search. Use as authority/catalog context only; results can be works, authorities, or resources and are not identity/contact evidence.",
  });
}

export function mapLibraryOfCongressEntryToProfileInput(
  query: string,
  entry: LibraryOfCongressEntry,
): UpsertProfileInput | null {
  if (!entry.id || !entry.title || !isNameAuthorityEntry(entry)) {
    return null;
  }

  const displayName = extractDisplayName(entry.title, query);
  if (!displayName) {
    return null;
  }

  return {
    id: `p_loc_${hashStable(entry.id)}`,
    fullName: displayName,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      `Library of Congress result: ${entry.title}`,
      `LOC ID: ${entry.id}`,
      entry.href ? `Resource: ${entry.href}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: "Library of Congress",
        state: "US",
        kind: "authority or catalog metadata",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: entry.id,
      raw: entry,
    },
  };
}

export function parseLibraryOfCongressSearch(value: unknown): LibraryOfCongressEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries = value.filter(
    (item): item is LocJsonArray =>
      Array.isArray(item) && item[0] === "atom:entry",
  );

  const parsed: LibraryOfCongressEntry[] = [];
  for (const entry of entries) {
    const title = findLocText(entry, "atom:title");
    const id = findLocText(entry, "atom:id");
    const href = findLocLink(entry);
    if (title && id) {
      parsed.push({
        title,
        id,
        href,
      });
    }
  }

  return parsed;
}

function buildLibraryOfCongressUrl(query: string) {
  const url = new URL("https://id.loc.gov/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  return url.toString();
}

function findLocText(entry: LocJsonArray, tag: string) {
  const child = entry.find((item) => Array.isArray(item) && item[0] === tag) as
    | LocJsonArray
    | undefined;
  const value = child?.find((item) => typeof item === "string" && item !== tag);
  return typeof value === "string" ? value : "";
}

function findLocLink(entry: LocJsonArray) {
  const link = entry.find(
    (item) =>
      Array.isArray(item) &&
      item[0] === "atom:link" &&
      item.some((part) => isLocAttributes(part) && part.rel === "alternate"),
  ) as LocJsonArray | undefined;
  const attrs = link?.find(isLocAttributes);
  return attrs?.href;
}

function isLocAttributes(value: unknown): value is { href?: string; rel?: string } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function titleMatchesQuery(title: string, query: string) {
  return isPersonLikeSearchName(title, tokenizeName(query));
}

function extractDisplayName(title: string, query: string) {
  const queryTokens = tokenizeName(query);
  const authorityHeading = title.split(".")[0]?.trim() ?? "";
  const invertedName = extractInvertedName(authorityHeading);

  if (invertedName && isPersonLikeSearchName(invertedName, queryTokens)) {
    return invertedName;
  }

  return titleMatchesQuery(authorityHeading, query) ? authorityHeading : "";
}

function isNameAuthorityEntry(entry: LibraryOfCongressEntry) {
  return [entry.id, entry.href].some((value) =>
    Boolean(value && /\/authorities\/names\//.test(value)),
  );
}

function extractInvertedName(value: string) {
  const parts = value
    .split(",")
    .map((part) => stripDateFragments(part).trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return value.trim();
  }

  const [familyName, ...givenParts] = parts;
  return [...givenParts, familyName].join(" ").replace(/\s+/g, " ").trim();
}

function stripDateFragments(value: string) {
  return value
    .replace(/\b\d{3,4}\??(?:\s*-\s*\d{0,4}\??)?/g, " ")
    .replace(/\s+-\s*/g, " ");
}

function hashStable(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

type LocJsonArray = unknown[];

export type LibraryOfCongressEntry = {
  title: string;
  id: string;
  href?: string;
};
