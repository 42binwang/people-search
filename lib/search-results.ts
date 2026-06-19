import {
  getCachedSearchResults,
  searchProfiles,
  setCachedSearchResults,
  type SearchResult,
} from "@/lib/db";
import {
  formatNameSourceRefreshNotice,
  refreshNameSearchSources,
} from "@/lib/name-source-refresh";
import { formatCacheTtl } from "@/lib/search-cache";
import type { SearchPayload } from "@/lib/search-store";

export type SearchResultsResponse = {
  mode: SearchPayload["mode"];
  results: SearchResult[];
  refreshNotice: string | null;
  cacheNotice: string | null;
};

export async function loadSearchResults(
  payload: SearchPayload,
): Promise<SearchResultsResponse> {
  if (payload.mode === "name") {
    const refreshSummary = await refreshNameSearchSources(payload);
    return {
      mode: payload.mode,
      results: searchProfiles(payload),
      refreshNotice: formatNameSourceRefreshNotice(refreshSummary),
      cacheNotice: null,
    };
  }

  const cachedResults = getCachedSearchResults(payload);
  if (cachedResults) {
    return {
      mode: payload.mode,
      results: cachedResults.results,
      refreshNotice: cachedResults.refreshNotice,
      cacheNotice: `Served from local query cache. Expires in ${formatCacheTtl(
        cachedResults.remainingTtlMs,
      )}.`,
    };
  }

  const results = searchProfiles(payload);
  setCachedSearchResults({
    payload,
    results,
    refreshNotice: null,
  });

  return {
    mode: payload.mode,
    results,
    refreshNotice: null,
    cacheNotice: "Stored these results in the local query cache.",
  };
}
