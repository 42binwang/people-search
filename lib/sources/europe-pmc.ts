import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type EuropePmcIngestInput = {
  query: string;
  limit?: number;
};

export type EuropePmcIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "europe_pmc_articles";

export async function ingestEuropePmcAuthors(
  input: EuropePmcIngestInput,
): Promise<EuropePmcIngestResult> {
  registerEuropePmcSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildEuropePmcSearchUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchEuropePmcIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Europe PMC request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as EuropePmcSearchResponse;
  const articles = applyImportLimit(payload.resultList?.result ?? [], limit);
  let imported = 0;

  for (const article of articles) {
    const profiles = mapEuropePmcArticleToProfileInputs(input.query, article);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: articles.length,
    imported,
    url,
  };
}

export function registerEuropePmcSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Europe PMC Articles RESTful API",
    category: "Life-science publication author mention",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://europepmc.org/RestfulWebService",
    notes:
      "Europe PMC Articles RESTful API. Use as life-science publication author context only; not residential, contact, medical, employment, or identity-verification evidence.",
  });
}

export function mapEuropePmcArticleToProfileInputs(
  query: string,
  article: EuropePmcArticle,
): UpsertProfileInput[] {
  const articleId = article.id || article.pmid || article.doi;
  const authors = article.authorList?.author ?? [];
  if (!articleId || !authors.length) {
    return [];
  }

  const title = article.title || "Untitled Europe PMC article";
  const journal = article.journalInfo?.journal?.title || article.journalTitle;
  const queryNorm = normalizeName(query);

  return authors
    .map((author, index) => ({ author, index }))
    .filter(({ author }) => authorMatchesQuery(author, queryNorm))
    .map(({ author, index }) => {
      const fullName = formatAuthorName(author);
      const affiliations = extractAffiliations(author);

      return {
        id: `p_europepmc_${slugify(fullName)}_${hashStable(articleId)}_${index}`,
        fullName,
        ageRange: "Unknown",
        confidence: "Low",
        aliases: [
          `Publication: ${title}`,
          article.pmid ? `PMID: ${article.pmid}` : "",
          article.doi ? `DOI: ${article.doi}` : "",
          journal ? `Journal: ${journal}` : "",
          article.pubYear ? `Published: ${article.pubYear}` : "",
          article.source ? `Europe PMC source: ${article.source}` : "",
          article.citedByCount ? `Cited by count: ${article.citedByCount}` : "",
        ].filter(Boolean),
        locations: affiliations.length
          ? affiliations.map((affiliation) => ({
              city: affiliation,
              state: "Europe PMC metadata",
              kind: "publication affiliation",
              sourceId,
            }))
          : [
              {
                city: "Europe PMC",
                state: "Global",
                kind: "life-science publication author mention",
                sourceId,
              },
            ],
        contacts: [],
        relationships: [],
        sourceRecord: {
          sourceId,
          sourceRecordId: `${articleId}:${index}`,
          raw: {
            article: scrubEmailLikeDeep(article),
            matchedAuthor: scrubEmailLikeDeep(author),
          },
        },
      };
    });
}

function buildEuropePmcSearchUrl(input: {
  query: string;
  limit: number | undefined;
}) {
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.searchParams.set("query", `AUTH:"${input.query}"`);
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  if (input.limit) {
    url.searchParams.set("pageSize", String(input.limit));
  }
  return url.toString();
}

function authorMatchesQuery(author: EuropePmcAuthor, queryNorm: string) {
  const authorNorm = normalizeName(formatAuthorName(author));
  const tokens = queryNorm.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => authorNorm.includes(token));
}

function formatAuthorName(author: EuropePmcAuthor) {
  if (author.firstName || author.lastName) {
    return [author.firstName, author.lastName].filter(Boolean).join(" ").trim();
  }
  return author.fullName || "";
}

function extractAffiliations(author: EuropePmcAuthor) {
  const affiliations =
    author.authorAffiliationDetailsList?.authorAffiliation
      ?.map((value) => stripEmailLike(value.affiliation ?? ""))
      .filter(Boolean) ?? [];
  return Array.from(new Set(affiliations)).slice(0, 5);
}

function stripEmailLike(value: string) {
  return value
    .replace(/[^\s,;<>]+@[^\s,;<>]+/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function scrubEmailLikeDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return stripEmailLike(value);
  }

  if (Array.isArray(value)) {
    return value.map(scrubEmailLikeDeep);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, scrubEmailLikeDeep(entry)]),
    );
  }

  return value;
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

type EuropePmcSearchResponse = {
  resultList?: {
    result?: EuropePmcArticle[];
  };
};

export type EuropePmcArticle = {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  pubYear?: string;
  journalTitle?: string;
  citedByCount?: string;
  journalInfo?: {
    journal?: {
      title?: string;
    };
  };
  authorList?: {
    author?: EuropePmcAuthor[];
  };
};

type EuropePmcAuthor = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  authorAffiliationDetailsList?: {
    authorAffiliation?: Array<{
      affiliation?: string;
    }>;
  };
};
