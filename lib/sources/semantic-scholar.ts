import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type SemanticScholarIngestInput = {
  query: string;
  limit?: number;
  apiKey?: string;
};

export type SemanticScholarIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "semantic_scholar_authors";

export async function ingestSemanticScholarAuthors(
  input: SemanticScholarIngestInput,
): Promise<SemanticScholarIngestResult> {
  registerSemanticScholarSource();

  const limit = clampLimit(input.limit, 100);
  const apiKey = input.apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY;
  const url = buildSemanticScholarAuthorUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: semanticScholarHeaders(apiKey),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Semantic Scholar request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as SemanticScholarAuthorResponse;
  const authors = applyImportLimit(payload.data ?? [], limit);
  let imported = 0;

  for (const author of authors) {
    const profile = mapSemanticScholarAuthorToProfileInput(input.query, author);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: authors.length,
    imported,
    url,
  };
}

export function registerSemanticScholarSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Semantic Scholar Author Search",
    category: "Scholarly author profile",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.semanticscholar.org/product/api",
    notes:
      "Semantic Scholar Academic Graph author search. Use as scholarly publication context only; author profiles are not residential, contact, employment, or identity-verification evidence.",
  });
}

export function mapSemanticScholarAuthorToProfileInput(
  query: string,
  author: SemanticScholarAuthor,
): UpsertProfileInput | null {
  if (!author.authorId || !author.name || !nameMatchesQuery(author.name, query)) {
    return null;
  }

  const affiliations = uniqueStrings(author.affiliations).slice(0, 5);
  const orcid = firstExternalId(author.externalIds?.ORCID);

  return {
    id: `p_semanticscholar_${slugify(author.authorId)}`,
    fullName: author.name,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases: [
      `Semantic Scholar author ID: ${author.authorId}`,
      author.url ? `Semantic Scholar profile: ${author.url}` : "",
      author.homepage ? `Homepage metadata: ${author.homepage}` : "",
      orcid ? `ORCID: ${orcid}` : "",
      typeof author.paperCount === "number"
        ? `Paper count: ${author.paperCount}`
        : "",
      typeof author.citationCount === "number"
        ? `Citation count: ${author.citationCount}`
        : "",
      typeof author.hIndex === "number" ? `h-index: ${author.hIndex}` : "",
    ].filter(Boolean),
    locations: affiliations.length
      ? affiliations.map((affiliation) => ({
          city: affiliation,
          state: "Semantic Scholar metadata",
          kind: "scholarly affiliation",
          sourceId,
        }))
      : [
          {
            city: "Semantic Scholar",
            state: "Global",
            kind: "scholarly author metadata",
            sourceId,
          },
        ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: author.authorId,
      raw: author,
    },
  };
}

function buildSemanticScholarAuthorUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://api.semanticscholar.org/graph/v1/author/search");
  url.searchParams.set("query", input.query);
  if (input.limit) {
    url.searchParams.set("limit", String(input.limit));
  }
  url.searchParams.set(
    "fields",
    "name,url,affiliations,paperCount,citationCount,hIndex,homepage,externalIds",
  );
  return url.toString();
}

function semanticScholarHeaders(apiKey?: string) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "PeopleSearchSemanticScholarIngest/0.1 local-development",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function uniqueStrings(values: string[] | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

function firstExternalId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type SemanticScholarAuthorResponse = {
  data?: SemanticScholarAuthor[];
};

export type SemanticScholarAuthor = {
  authorId?: string;
  name?: string;
  url?: string;
  homepage?: string;
  affiliations?: string[];
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  externalIds?: {
    ORCID?: string | string[];
  };
};
