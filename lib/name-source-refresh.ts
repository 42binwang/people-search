import {
  getFreshSourceSearchRefresh,
  setSourceSearchRefresh,
} from "@/lib/db";
import { createSearchCacheKey } from "@/lib/search-cache";
import type { SearchPayload } from "@/lib/search-store";
import { ingestArxivAuthors } from "@/lib/sources/arxiv";
import { ingestClinicalTrialsPersonnel } from "@/lib/sources/clinical-trials";
import { ingestCrossrefWorks } from "@/lib/sources/crossref";
import { ingestDataCiteCreators } from "@/lib/sources/datacite";
import { ingestEuropePmcAuthors } from "@/lib/sources/europe-pmc";
import { ingestFecCandidates } from "@/lib/sources/fec";
import { ingestFecScheduleAContributions } from "@/lib/sources/fec-schedule-a";
import { ingestFederalRegisterMentions } from "@/lib/sources/federal-register";
import { ingestGitHubUsers } from "@/lib/sources/github";
import { ingestGoogleBooksAuthors } from "@/lib/sources/google-books";
import { ingestInternetArchiveCreators } from "@/lib/sources/internet-archive";
import { ingestLibraryOfCongressSearch } from "@/lib/sources/library-of-congress";
import { ingestMusicBrainzArtists } from "@/lib/sources/musicbrainz";
import { ingestNppes } from "@/lib/sources/nppes";
import { ingestOpenLibraryAuthors } from "@/lib/sources/open-library";
import { ingestOpenAlexAuthors } from "@/lib/sources/openalex";
import { ingestOrcidPublicRecords } from "@/lib/sources/orcid";
import { ingestPubMedAuthors } from "@/lib/sources/pubmed";
import { ingestSemanticScholarAuthors } from "@/lib/sources/semantic-scholar";
import { ingestStackExchangeUsers } from "@/lib/sources/stack-exchange";
import { ingestViafAuthorityRecords } from "@/lib/sources/viaf";
import { ingestWikidataEntities } from "@/lib/sources/wikidata";

export const DEFAULT_NAME_SOURCE_REFRESH_TTL_MS = 1000 * 60 * 60;
export const DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS = 15000;

type NameSearchPayload = Extract<SearchPayload, { mode: "name" }>;

type SourceRefreshOutcome = {
  sourceId: string;
  label: string;
  status: "refreshed" | "skipped" | "failed";
  fetched: number;
  imported: number;
  errorMessage?: string;
};

export type NameSourceRefreshSummary = {
  refreshed: SourceRefreshOutcome[];
  skipped: SourceRefreshOutcome[];
  failed: SourceRefreshOutcome[];
  totalImported: number;
};

type NameSourceAdapter = {
  sourceId: string;
  label: string;
  run: (payload: NameSearchPayload, query: string) => Promise<{
    fetched: number;
    imported: number;
  }>;
};

export async function refreshNameSearchSources(
  payload: NameSearchPayload,
  options: {
    nowMs?: number;
    ttlMs?: number;
    adapters?: NameSourceAdapter[];
  } = {},
): Promise<NameSourceRefreshSummary> {
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? getNameSourceRefreshTtlMs();
  const queryKey = createSearchCacheKey(payload);
  const query = [payload.firstName, payload.lastName].filter(Boolean).join(" ");
  const adapters = options.adapters ?? automaticNameSourceAdapters;

  const outcomes = await Promise.all(
    adapters.map((adapter) =>
      refreshNameSourceAdapter({
        adapter,
        payload,
        query,
        queryKey,
        nowMs,
        ttlMs,
      }),
    ),
  );

  return {
    refreshed: outcomes.filter((outcome) => outcome.status === "refreshed"),
    skipped: outcomes.filter((outcome) => outcome.status === "skipped"),
    failed: outcomes.filter((outcome) => outcome.status === "failed"),
    totalImported: outcomes
      .filter((outcome) => outcome.status === "refreshed")
      .reduce((sum, outcome) => sum + outcome.imported, 0),
  };
}

export function formatNameSourceRefreshNotice(summary: NameSourceRefreshSummary) {
  const pieces = [
    `${summary.refreshed.length} source(s) refreshed`,
    `${summary.skipped.length} still fresh`,
  ];

  if (summary.failed.length > 0) {
    pieces.push(`${summary.failed.length} unavailable`);
  }

  return `Checked approved sources: ${pieces.join(", ")}; imported ${summary.totalImported} profile(s).`;
}

export function getNameSourceRefreshTtlMs(
  value = process.env.NAME_SOURCE_REFRESH_TTL_SECONDS,
) {
  if (!value) {
    return DEFAULT_NAME_SOURCE_REFRESH_TTL_MS;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_NAME_SOURCE_REFRESH_TTL_MS;
  }

  return Math.round(seconds * 1000);
}

export function getNameSourceRefreshTimeoutMs(
  value = process.env.NAME_SOURCE_REFRESH_TIMEOUT_SECONDS,
) {
  if (!value) {
    return DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS;
  }

  return Math.round(seconds * 1000);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} refresh timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function refreshNameSourceAdapter(input: {
  adapter: NameSourceAdapter;
  payload: NameSearchPayload;
  query: string;
  queryKey: string;
  nowMs: number;
  ttlMs: number;
}): Promise<SourceRefreshOutcome> {
  const fresh = getFreshSourceSearchRefresh({
    sourceId: input.adapter.sourceId,
    queryKey: input.queryKey,
    nowMs: input.nowMs,
    ttlMs: input.ttlMs,
  });

  if (fresh) {
    return {
      sourceId: input.adapter.sourceId,
      label: input.adapter.label,
      status: "skipped",
      fetched: fresh.fetched,
      imported: fresh.imported,
    };
  }

  try {
    const result = await withTimeout(
      input.adapter.run(input.payload, input.query),
      getNameSourceRefreshTimeoutMs(),
      input.adapter.label,
    );
    setSourceSearchRefresh({
      sourceId: input.adapter.sourceId,
      queryKey: input.queryKey,
      status: "success",
      fetched: result.fetched,
      imported: result.imported,
      refreshedAtMs: input.nowMs,
    });

    return {
      sourceId: input.adapter.sourceId,
      label: input.adapter.label,
      status: "refreshed",
      fetched: result.fetched,
      imported: result.imported,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown refresh error";
    setSourceSearchRefresh({
      sourceId: input.adapter.sourceId,
      queryKey: input.queryKey,
      status: "failed",
      errorMessage,
      refreshedAtMs: input.nowMs,
    });

    return {
      sourceId: input.adapter.sourceId,
      label: input.adapter.label,
      status: "failed",
      fetched: 0,
      imported: 0,
      errorMessage,
    };
  }
}

const automaticNameSourceAdapters: NameSourceAdapter[] = [
  {
    sourceId: "cms_nppes_npi_registry",
    label: "CMS NPPES",
    run: (payload) =>
      ingestNppes({
        firstName: payload.firstName,
        lastName: payload.lastName,
        city: payload.city,
        state: payload.state,
      }),
  },
  {
    sourceId: "fec_openfec_candidates",
    label: "OpenFEC",
    run: (_payload, query) => ingestFecCandidates({ query }),
  },
  {
    sourceId: "fec_openfec_schedule_a",
    label: "FEC Schedule A",
    run: (_payload, query) => ingestFecScheduleAContributions({ query }),
  },
  {
    sourceId: "federal_register_documents",
    label: "Federal Register",
    run: (_payload, query) => ingestFederalRegisterMentions({ query }),
  },
  {
    sourceId: "openalex_authors",
    label: "OpenAlex",
    run: (_payload, query) => ingestOpenAlexAuthors({ query }),
  },
  {
    sourceId: "wikidata_entities",
    label: "Wikidata",
    run: (_payload, query) => ingestWikidataEntities({ query }),
  },
  {
    sourceId: "crossref_works",
    label: "Crossref",
    run: (_payload, query) => ingestCrossrefWorks({ query }),
  },
  {
    sourceId: "clinicaltrials_gov_studies",
    label: "ClinicalTrials.gov",
    run: (_payload, query) => ingestClinicalTrialsPersonnel({ query }),
  },
  {
    sourceId: "datacite_dois",
    label: "DataCite",
    run: (_payload, query) => ingestDataCiteCreators({ query }),
  },
  {
    sourceId: "ncbi_pubmed",
    label: "PubMed",
    run: async (_payload, query) => {
      const result = await ingestPubMedAuthors({ query });
      return {
        fetched: result.fetched,
        imported: result.imported,
      };
    },
  },
  {
    sourceId: "internet_archive_advanced_search",
    label: "Internet Archive",
    run: (_payload, query) => ingestInternetArchiveCreators({ query }),
  },
  {
    sourceId: "arxiv_api",
    label: "arXiv",
    run: (_payload, query) => ingestArxivAuthors({ query }),
  },
  {
    sourceId: "open_library_authors",
    label: "Open Library",
    run: (_payload, query) => ingestOpenLibraryAuthors({ query }),
  },
  {
    sourceId: "library_of_congress_search",
    label: "Library of Congress",
    run: (_payload, query) => ingestLibraryOfCongressSearch({ query }),
  },
  {
    sourceId: "github_users",
    label: "GitHub",
    run: (_payload, query) => ingestGitHubUsers({ query }),
  },
  {
    sourceId: "stackexchange_users",
    label: "Stack Exchange",
    run: (_payload, query) => ingestStackExchangeUsers({ query }),
  },
  {
    sourceId: "viaf_authority_search",
    label: "VIAF",
    run: (_payload, query) => ingestViafAuthorityRecords({ query }),
  },
  {
    sourceId: "musicbrainz_artists",
    label: "MusicBrainz",
    run: (_payload, query) => ingestMusicBrainzArtists({ query }),
  },
  {
    sourceId: "orcid_public_registry",
    label: "ORCID",
    run: (_payload, query) => ingestOrcidPublicRecords({ query }),
  },
  {
    sourceId: "semantic_scholar_authors",
    label: "Semantic Scholar",
    run: (_payload, query) => ingestSemanticScholarAuthors({ query }),
  },
  {
    sourceId: "google_books_volumes",
    label: "Google Books",
    run: (_payload, query) => ingestGoogleBooksAuthors({ query }),
  },
  {
    sourceId: "europe_pmc_articles",
    label: "Europe PMC",
    run: (_payload, query) => ingestEuropePmcAuthors({ query }),
  },
];
