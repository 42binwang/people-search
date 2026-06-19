import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type PubMedIngestInput = {
  query: string;
  limit?: number;
  email?: string;
  apiKey?: string;
};

export type PubMedIngestResult = {
  fetched: number;
  imported: number;
  searchUrl: string;
  summaryUrl: string | null;
};

const sourceId = "ncbi_pubmed";

export async function ingestPubMedAuthors(
  input: PubMedIngestInput,
): Promise<PubMedIngestResult> {
  registerPubMedSource();

  const limit = clampLimit(input.limit, 100);
  const searchUrl = buildPubMedSearchUrl({
    query: input.query,
    limit,
    email: input.email || process.env.NCBI_EMAIL,
    apiKey: input.apiKey || process.env.NCBI_API_KEY,
  });

  const searchResponse = await fetch(searchUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchPubMedIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!searchResponse.ok) {
    throw new Error(
      `PubMed search failed: ${searchResponse.status} ${searchResponse.statusText}`,
    );
  }

  const searchPayload = (await searchResponse.json()) as PubMedSearchResponse;
  const ids = applyImportLimit(searchPayload.esearchresult?.idlist ?? [], limit);
  if (ids.length === 0) {
    return {
      fetched: 0,
      imported: 0,
      searchUrl,
      summaryUrl: null,
    };
  }

  const summaryUrl = buildPubMedSummaryUrl({
    ids,
    email: input.email || process.env.NCBI_EMAIL,
    apiKey: input.apiKey || process.env.NCBI_API_KEY,
  });
  const summaryResponse = await fetch(summaryUrl, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchPubMedIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!summaryResponse.ok) {
    throw new Error(
      `PubMed summary failed: ${summaryResponse.status} ${summaryResponse.statusText}`,
    );
  }

  const summaryPayload = (await summaryResponse.json()) as PubMedSummaryResponse;
  let imported = 0;

  for (const id of summaryPayload.result?.uids ?? []) {
    const article = summaryPayload.result?.[id];
    if (!isPubMedSummaryArticle(article)) {
      continue;
    }
    const profiles = mapPubMedArticleToProfileInputs(input.query, article);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: ids.length,
    imported,
    searchUrl,
    summaryUrl,
  };
}

function isPubMedSummaryArticle(value: unknown): value is PubMedSummaryArticle {
  return Boolean(
    value &&
      !Array.isArray(value) &&
      typeof value === "object" &&
      "uid" in value &&
      value.uid,
  );
}

export function registerPubMedSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "NCBI PubMed E-utilities",
    category: "PubMed author mention",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.ncbi.nlm.nih.gov/books/NBK25497/",
    notes:
      "Official NCBI E-utilities API for PubMed. Use as biomedical literature author context only; not residential or contact evidence.",
  });
}

export function mapPubMedArticleToProfileInputs(
  query: string,
  article: PubMedSummaryArticle,
): UpsertProfileInput[] {
  if (!article.uid || !article.authors?.length) {
    return [];
  }

  const title = article.title || "Untitled PubMed article";
  const source = article.fulljournalname || article.source;
  const doi = article.articleids?.find((id) => id.idtype === "doi")?.value;

  return article.authors
    .map((author, index) => ({ author, index }))
    .filter(({ author }) => pubMedAuthorMatchesQuery(author.name, query))
    .map(({ author, index }) => ({
      id: `p_pubmed_${slugify(author.name)}_${article.uid}_${index}`,
      fullName: author.name,
      ageRange: "Unknown",
      confidence: "Low",
      aliases: [
        `PubMed article: ${title}`,
        `PMID: ${article.uid}`,
        doi ? `DOI: ${doi}` : "",
        source ? `Journal: ${source}` : "",
        article.pubdate ? `Published: ${article.pubdate}` : "",
      ].filter(Boolean),
      locations: [
        {
          city: "PubMed",
          state: "Global",
          kind: "biomedical literature author mention",
          sourceId,
        },
      ],
      contacts: [],
      relationships: [],
      sourceRecord: {
        sourceId,
        sourceRecordId: `${article.uid}:${index}`,
        raw: {
          article,
          matchedAuthor: author,
        },
      },
    }));
}

function buildPubMedSearchUrl(input: {
  query: string;
  limit: number | undefined;
  email?: string;
  apiKey?: string;
}) {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("term", `${input.query}[Author]`);
  if (input.limit) {
    url.searchParams.set("retmax", String(input.limit));
  }
  url.searchParams.set("retmode", "json");
  url.searchParams.set("tool", "people-search-local");
  if (input.email) {
    url.searchParams.set("email", input.email);
  }
  if (input.apiKey) {
    url.searchParams.set("api_key", input.apiKey);
  }
  return url.toString();
}

function buildPubMedSummaryUrl(input: {
  ids: string[];
  email?: string;
  apiKey?: string;
}) {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", input.ids.join(","));
  url.searchParams.set("retmode", "json");
  url.searchParams.set("tool", "people-search-local");
  if (input.email) {
    url.searchParams.set("email", input.email);
  }
  if (input.apiKey) {
    url.searchParams.set("api_key", input.apiKey);
  }
  return url.toString();
}

function pubMedAuthorMatchesQuery(authorName: string, query: string) {
  const authorTokens = normalizeName(authorName).split(" ").filter(Boolean);
  const queryTokens = normalizeName(query).split(" ").filter(Boolean);

  if (queryTokens.length === 0) {
    return false;
  }

  const family = queryTokens[queryTokens.length - 1];
  const givenTokens = queryTokens.slice(0, -1);
  const hasFamily = authorTokens.includes(family);
  if (!hasFamily) {
    return false;
  }

  return givenTokens.every((token) =>
    authorTokens.some(
      (authorToken) => authorToken === token || authorToken === token[0],
    ),
  );
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type PubMedSearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type PubMedSummaryResponse = {
  result?: {
    uids?: string[];
    [uid: string]: PubMedSummaryArticle | string[] | undefined;
  };
};

export type PubMedSummaryArticle = {
  uid: string;
  title?: string;
  pubdate?: string;
  source?: string;
  fulljournalname?: string;
  authors?: Array<{
    name: string;
  }>;
  articleids?: Array<{
    idtype: string;
    value: string;
  }>;
};
