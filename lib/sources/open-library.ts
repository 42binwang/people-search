import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { isPersonLikeSearchName, tokenizeName } from "@/lib/name-search";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OpenLibraryIngestInput = {
  query: string;
  limit?: number;
};

export type OpenLibraryIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "open_library_authors";

export async function ingestOpenLibraryAuthors(
  input: OpenLibraryIngestInput,
): Promise<OpenLibraryIngestResult> {
  registerOpenLibrarySource();

  const limit = clampLimit(input.limit, 100);
  const url = buildOpenLibraryAuthorUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchOpenLibraryIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Open Library request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as OpenLibraryAuthorResponse;
  const docs = applyImportLimit(payload.docs ?? [], limit);
  let imported = 0;

  for (const author of docs) {
    const profile = mapOpenLibraryAuthorToProfileInput(input.query, author);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: docs.length,
    imported,
    url,
  };
}

export function registerOpenLibrarySource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Open Library Authors API",
    category: "Open Library author metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://openlibrary.org/dev/docs/api/authors",
    notes:
      "Open Library author search API. Use as library/catalog author context only; not residential or contact evidence.",
  });
}

export function mapOpenLibraryAuthorToProfileInput(
  query: string,
  author: OpenLibraryAuthorDoc,
): UpsertProfileInput | null {
  if (!author.key || !author.name || !nameMatchesQuery(author.name, query)) {
    return null;
  }

  const subjects = (author.top_subjects ?? []).slice(0, 5);

  return {
    id: `p_openlibrary_${slugify(author.key)}`,
    fullName: author.name,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      `Open Library author key: ${author.key}`,
      author.top_work ? `Top work: ${author.top_work}` : "",
      typeof author.work_count === "number"
        ? `Work count: ${author.work_count}`
        : "",
      subjects.length ? `Subjects: ${subjects.join(", ")}` : "",
      author.birth_date ? `Birth date metadata: ${author.birth_date}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: "Open Library",
        state: "Global",
        kind: "library author metadata",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: author.key,
      raw: author,
    },
  };
}

function buildOpenLibraryAuthorUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://openlibrary.org/search/authors.json");
  url.searchParams.set("q", input.query);
  if (input.limit) {
    url.searchParams.set("limit", String(input.limit));
  }
  return url.toString();
}

function nameMatchesQuery(name: string, query: string) {
  return isPersonLikeSearchName(name, tokenizeName(query));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type OpenLibraryAuthorResponse = {
  docs?: OpenLibraryAuthorDoc[];
};

export type OpenLibraryAuthorDoc = {
  key?: string;
  name?: string;
  birth_date?: string;
  top_work?: string;
  work_count?: number;
  top_subjects?: string[];
};
