import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type InternetArchiveIngestInput = {
  query: string;
  limit?: number;
};

export type InternetArchiveIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "internet_archive_advanced_search";

export async function ingestInternetArchiveCreators(
  input: InternetArchiveIngestInput,
): Promise<InternetArchiveIngestResult> {
  registerInternetArchiveSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildInternetArchiveUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchInternetArchiveIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Internet Archive request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as InternetArchiveResponse;
  const docs = applyImportLimit(payload.response?.docs ?? [], limit);
  let imported = 0;

  for (const doc of docs) {
    const profiles = mapInternetArchiveDocToProfileInputs(input.query, doc);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: docs.length,
    imported,
    url,
  };
}

export function registerInternetArchiveSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Internet Archive Advanced Search API",
    category: "Internet Archive creator metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://archive.org/help/aboutsearch.htm",
    notes:
      "Internet Archive metadata search. Use creator metadata as cultural/library context only; not residential or contact evidence.",
  });
}

export function mapInternetArchiveDocToProfileInputs(
  query: string,
  doc: InternetArchiveDoc,
): UpsertProfileInput[] {
  if (!doc.identifier || !doc.creator) {
    return [];
  }

  const identifier = doc.identifier;
  const creators = Array.isArray(doc.creator) ? doc.creator : [doc.creator];
  return creators
    .map((creator, index) => ({ creator, index }))
    .filter(({ creator }) => nameMatchesQuery(creator, query))
    .map(({ creator, index }) => ({
      id: `p_ia_${slugify(creator)}_${slugify(identifier)}_${index}`,
      fullName: creator,
      ageRange: "Unknown",
      confidence: "Low",
      aliases: [
        doc.title ? `Internet Archive item: ${doc.title}` : "",
        `Archive identifier: ${identifier}`,
        doc.year ? `Year: ${doc.year}` : "",
      ].filter(Boolean),
      locations: [
        {
          city: "Internet Archive",
          state: "Global",
          kind: "archive creator metadata",
          sourceId,
        },
      ],
      contacts: [],
      relationships: [],
      sourceRecord: {
        sourceId,
          sourceRecordId: `${identifier}:${index}`,
        raw: {
          doc,
          matchedCreator: creator,
        },
      },
    }));
}

function buildInternetArchiveUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", `creator:"${input.query}"`);
  for (const field of ["identifier", "title", "creator", "year"]) {
    url.searchParams.append("fl[]", field);
  }
  if (input.limit) {
    url.searchParams.set("rows", String(input.limit));
  }
  url.searchParams.set("output", "json");
  return url.toString();
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type InternetArchiveResponse = {
  response?: {
    docs?: InternetArchiveDoc[];
  };
};

export type InternetArchiveDoc = {
  identifier?: string;
  title?: string;
  creator?: string | string[];
  year?: string | number;
};
