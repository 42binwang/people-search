import {
  getFreshSourceSearchRefreshBatch,
  setSourceSearchRefresh,
  type SourceSearchRefresh,
} from "@/lib/db";
import { createSearchCacheKey } from "@/lib/search-cache";
import type { SearchPayload } from "@/lib/search-store";
import { ingestArxivAuthors } from "@/lib/sources/arxiv";
import { ingestBuffaloPermits } from "@/lib/sources/buffalo-permits";
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
import { ingestNihReporterProjects } from "@/lib/sources/nih-reporter";
import { ingestNppes } from "@/lib/sources/nppes";
import { ingestNsfAwards } from "@/lib/sources/nsf-award-search";
import { ingestChicagoSalaries } from "@/lib/sources/chicago-salaries";
import { ingestFloridaSalaries } from "@/lib/sources/florida-salaries";
import { ingestNycPayroll } from "@/lib/sources/nyc-payroll";
import { ingestSeeThroughNyPayrolls } from "@/lib/sources/seethroughny-payrolls";
import { ingestUcAnnualWage } from "@/lib/sources/uc-annual-wage";
import { ingestNycAcrisDeeds } from "@/lib/sources/nyc-acris-deeds";
import { ingestChroniclingAmerica } from "@/lib/sources/chronicling-america";
import { ingestSecEdgarInsiders } from "@/lib/sources/sec-edgar-insiders";
import { ingestSenateLdaLobbying } from "@/lib/sources/senate-lda";
import { ingestOpenLibraryAuthors } from "@/lib/sources/open-library";
import { ingestOpenAlexAuthors } from "@/lib/sources/openalex";
import { ingestOrcidPublicRecords } from "@/lib/sources/orcid";
import { ingestPubMedAuthors } from "@/lib/sources/pubmed";
import { ingestSemanticScholarAuthors } from "@/lib/sources/semantic-scholar";
import { ingestStackExchangeUsers } from "@/lib/sources/stack-exchange";
import { ingestUsptoTrademarkOwners } from "@/lib/sources/uspto-trademark";
import { ingestUsptoPatentInventors } from "@/lib/sources/uspto-patent";
import { ingestViafAuthorityRecords } from "@/lib/sources/viaf";
import { ingestWikidataEntities } from "@/lib/sources/wikidata";

export const DEFAULT_NAME_SOURCE_REFRESH_TTL_MS = 1000 * 60 * 60 * 24;
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

  // One query for every fresh source under this query key, instead of one DB
  // round-trip per source on every search.
  const freshBySource = getFreshSourceSearchRefreshBatch({
    queryKey,
    nowMs,
    ttlMs,
  });

  const outcomes = await Promise.all(
    adapters.map((adapter) =>
      refreshNameSourceAdapter({
        adapter,
        payload,
        query,
        queryKey,
        nowMs,
        freshBySource,
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

export function formatNameSourceRefreshNotice(
  summary: NameSourceRefreshSummary,
): string | null {
  // Nothing changed (every source was already fresh, none failed): the notice
  // is noise on a cached repeat search, so suppress it.
  if (summary.refreshed.length === 0 && summary.failed.length === 0) {
    return null;
  }

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
  freshBySource: Map<string, SourceSearchRefresh>;
}): Promise<SourceRefreshOutcome> {
  const fresh = input.freshBySource.get(input.adapter.sourceId) ?? null;

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
    sourceId: "nih_reporter",
    label: "NIH RePORTer",
    run: (_payload, query) => ingestNihReporterProjects({ query }),
  },
  {
    sourceId: "nsf_award_search",
    label: "NSF Awards",
    run: (payload) =>
      ingestNsfAwards({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "nyc_citywide_payroll",
    label: "NYC Payroll",
    run: (payload) =>
      ingestNycPayroll({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "chicago_current_employee_salaries",
    label: "Chicago Salaries",
    run: (payload) =>
      ingestChicagoSalaries({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "florida_state_employee_salaries",
    label: "Florida Salaries",
    run: (payload) =>
      ingestFloridaSalaries({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "seethroughny_payrolls",
    label: "SeeThroughNY",
    run: (payload) =>
      ingestSeeThroughNyPayrolls({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "uc_annual_wage",
    label: "UC Annual Wage",
    run: (payload) =>
      ingestUcAnnualWage({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "nyc_acris_deeds",
    label: "NYC ACRIS",
    run: (payload) =>
      ingestNycAcrisDeeds({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
  {
    sourceId: "chronicling_america_obituaries",
    label: "Chronicling America",
    run: (_payload, query) => ingestChroniclingAmerica({ query }),
  },
  {
    sourceId: "sec_edgar_insiders",
    label: "SEC EDGAR Insiders",
    run: (_payload, query) => ingestSecEdgarInsiders({ query }),
  },
  {
    sourceId: "senate_lda_lobbying",
    label: "Senate LDA",
    run: (payload) =>
      ingestSenateLdaLobbying({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
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
  {
    sourceId: "uspto_trademark_owners",
    label: "USPTO Trademarks",
    run: (_payload, query) => ingestUsptoTrademarkOwners({ query }),
  },
  {
    sourceId: "uspto_patent_inventors",
    label: "USPTO Patents",
    run: (_payload, query) => ingestUsptoPatentInventors({ query }),
  },
  {
    sourceId: "buffalo_ny_building_permits",
    label: "Buffalo Permits",
    run: (payload) =>
      ingestBuffaloPermits({
        firstName: payload.firstName,
        lastName: payload.lastName,
      }),
  },
];
