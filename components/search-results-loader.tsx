"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { RecordFeedbackButtons } from "@/components/record-feedback-buttons";
import type { SearchResult } from "@/lib/db";
import type { SearchResultsResponse } from "@/lib/search-results";
import type { SearchMode } from "@/lib/search-store";

type ResultsState =
  | { status: "loading" }
  | { status: "ready"; data: SearchResultsResponse }
  | { status: "error"; message: string };

const AI_THINKING_STATUS_WORDS = [
  "Thinking",
  "Searching",
  "Reading",
  "Analyzing",
  "Synthesizing",
] as const;
const AI_THINKING_STATUS_ROTATION_MS = 1400;

const AGE_BUCKETS = [
  { value: "under-30", label: "Under 30", min: 0, max: 29 },
  { value: "30-39", label: "30-39", min: 30, max: 39 },
  { value: "40-49", label: "40-49", min: 40, max: 49 },
  { value: "50-59", label: "50-59", min: 50, max: 59 },
  { value: "60-69", label: "60-69", min: 60, max: 69 },
  { value: "70-plus", label: "70+", min: 70, max: 130 },
] as const;

type AgeFilter = (typeof AGE_BUCKETS)[number]["value"] | "unknown" | "";
type ParsedLocation = NonNullable<ReturnType<typeof parseLocation>>;

export function SearchResultsLoader({
  mode,
  token,
}: Readonly<{
  mode: SearchMode;
  token: string;
}>) {
  const [state, setState] = useState<ResultsState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      const startedAt = Date.now();
      setState({ status: "loading" });
      try {
        const response = await fetch(`/search/results/${token}/data`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Search expired. Start a new search to generate fresh results."
              : "Search results were unavailable. Please try again.",
          );
        }

        const data = (await response.json()) as SearchResultsResponse;
        await waitForMinimumLoadingTime(startedAt);
        setState({ status: "ready", data });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        await waitForMinimumLoadingTime(startedAt);
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Search results were unavailable. Please try again.",
        });
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [token]);

  return (
    <>
      <div aria-live="polite">
        {state.status === "loading" && <SearchLoading mode={mode} />}
        {state.status === "error" && <SearchError message={state.message} />}
        {state.status === "ready" && (
          <SearchResults
            cacheNotice={state.data.cacheNotice}
            refreshNotice={state.data.refreshNotice}
            results={state.data.results}
            token={token}
          />
        )}
      </div>
    </>
  );
}

function waitForMinimumLoadingTime(startedAt: number) {
  const remainingMs = 550 - (Date.now() - startedAt);
  if (remainingMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, remainingMs));
}

function SearchLoading({ mode }: Readonly<{ mode: SearchMode }>) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhraseIndex(
        (current) => (current + 1) % AI_THINKING_STATUS_WORDS.length,
      );
    }, AI_THINKING_STATUS_ROTATION_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="results-grid">
      <section className="loading-panel" aria-label="Loading search results">
        <div className="loading-spinner" aria-hidden="true">
          <LoaderCircle size={34} />
        </div>
        <div>
          <h2>{AI_THINKING_STATUS_WORDS[phraseIndex]}</h2>
          <p className="fine-print">
            Preparing {mode} results from local records and refreshed source
            signals.
          </p>
        </div>
        <div className="loading-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
      <aside className="info-rail" aria-label="Result controls">
        <div className="ad-slot">Ad placement preview</div>
        <Link className="button secondary" href="/opt-out">
          Remove my info
        </Link>
        <Link className="button secondary" href="/report">
          Report harmful data
        </Link>
      </aside>
    </div>
  );
}

function SearchError({ message }: Readonly<{ message: string }>) {
  return (
    <div className="results-grid">
      <section className="legal-panel">
        <h2>Results unavailable</h2>
        <p>{message}</p>
        <Link className="button" href="/">
          New search
        </Link>
      </section>
      <ResultControls />
    </div>
  );
}

function SearchResults({
  cacheNotice,
  refreshNotice,
  results,
  token,
}: Readonly<{
  cacheNotice: string | null;
  refreshNotice: string | null;
  results: SearchResult[];
  token: string;
}>) {
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("");
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const filterOptions = useMemo(() => buildFilterOptions(results), [results]);
  const filteredResults = useMemo(
    () =>
      results.filter((result) =>
        matchesFilters(result, {
          age: ageFilter,
          cityKey: cityFilter,
          state: stateFilter,
        }),
      ),
    [ageFilter, cityFilter, results, stateFilter],
  );
  const cityOptions = stateFilter
    ? filterOptions.cities.filter((city) => city.state === stateFilter)
    : filterOptions.cities;
  const hasActiveFilters = Boolean(ageFilter || stateFilter || cityFilter);

  function clearFilters() {
    setAgeFilter("");
    setStateFilter("");
    setCityFilter("");
  }

  return (
    <>
      {(refreshNotice || cacheNotice) && (
        <div className="result-notices">
          {refreshNotice && <p className="fine-print">{refreshNotice}</p>}
          {cacheNotice && <p className="fine-print">{cacheNotice}</p>}
        </div>
      )}
      <div className="results-grid">
        <div className="result-list" aria-label="Search results">
          {results.length > 0 && (
            <section className="result-filters" aria-label="Filter results">
              <div>
                <label htmlFor="age-filter">Age range</label>
                <select
                  id="age-filter"
                  onChange={(event) =>
                    setAgeFilter(event.target.value as AgeFilter)
                  }
                  value={ageFilter}
                >
                  <option value="">Any age</option>
                  {filterOptions.ageBuckets.map((bucket) => (
                    <option key={bucket.value} value={bucket.value}>
                      {bucket.label}
                    </option>
                  ))}
                  {filterOptions.hasUnknownAge && (
                    <option value="unknown">Unknown age</option>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="state-filter">State</label>
                <select
                  id="state-filter"
                  onChange={(event) => {
                    setStateFilter(event.target.value);
                    setCityFilter("");
                  }}
                  value={stateFilter}
                >
                  <option value="">Any state</option>
                  {filterOptions.states.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="city-filter">City</label>
                <select
                  id="city-filter"
                  onChange={(event) => setCityFilter(event.target.value)}
                  value={cityFilter}
                >
                  <option value="">Any city</option>
                  {cityOptions.map((city) => (
                    <option key={city.key} value={city.key}>
                      {stateFilter ? city.city : `${city.city}, ${city.state}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-summary">
                <span>
                  Showing {filteredResults.length} of {results.length}
                </span>
                <button
                  disabled={!hasActiveFilters}
                  onClick={clearFilters}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </section>
          )}
          {results.length === 0 && (
            <section className="legal-panel">
              <h2>No matches found</h2>
              <p>
                Try another search. Approved sources are checked automatically
                for name searches when their source refresh is stale.
              </p>
            </section>
          )}
          {results.length > 0 && filteredResults.length === 0 && (
            <section className="legal-panel">
              <h2>No results match these filters</h2>
              <p>
                Adjust the age range, state, or city filter to show more
                profiles.
              </p>
            </section>
          )}
          {filteredResults.map((result) => (
            <ResultCard key={result.id} result={result} token={token} />
          ))}
        </div>
        <ResultControls />
      </div>
    </>
  );
}

function ResultCard({
  result,
  token,
}: Readonly<{ result: SearchResult; token: string }>) {
  return (
    <article className="result-card">
      <div>
        <div className="result-title">
          <h2>{result.name}</h2>
          <span className="confidence">{result.confidence}</span>
        </div>
        <p className="meta">
          Age {result.ageRange} · {result.locations.join(" · ")}
        </p>
        <div className="pill-row">
          {result.relatives.map((relative) => (
            <span className="pill" key={relative}>
              {relative}
            </span>
          ))}
        </div>
      </div>
      <div className="result-actions">
        <RecordFeedbackButtons profileId={result.id} searchToken={token} />
        <Link className="button secondary" href={`/profile/${result.id}`}>
          View
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function ResultControls() {
  return (
    <aside className="info-rail" aria-label="Result controls">
      <div className="ad-slot">Ad placement preview</div>
      <Link className="button secondary" href="/opt-out">
        Remove my info
      </Link>
      <Link className="button secondary" href="/report">
        Report harmful data
      </Link>
      <p className="fine-print">
        This page uses an opaque token. Search inputs are not present in the
        URL, page title, or ad placement labels.
      </p>
    </aside>
  );
}

function buildFilterOptions(results: SearchResult[]) {
  const stateSet = new Set<string>();
  const cityMap = new Map<string, { city: string; key: string; state: string }>();
  const hasUnknownAge = results.some(
    (result) => parseAgeRange(result.ageRange) === null,
  );
  const ageBuckets = AGE_BUCKETS.filter((bucket) =>
    results.some((result) => {
      const range = parseAgeRange(result.ageRange);
      return range ? rangesOverlap(range, bucket) : false;
    }),
  );

  for (const result of results) {
    for (const location of result.locations) {
      const parsed = parseLocation(location);
      if (!parsed) {
        continue;
      }

      stateSet.add(parsed.state);
      cityMap.set(parsed.key, parsed);
    }
  }

  return {
    ageBuckets,
    cities: Array.from(cityMap.values()).sort((a, b) =>
      `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`),
    ),
    hasUnknownAge,
    states: Array.from(stateSet).sort(),
  };
}

function matchesFilters(
  result: SearchResult,
  filters: { age: AgeFilter; cityKey: string; state: string },
) {
  if (filters.age && !matchesAgeFilter(result.ageRange, filters.age)) {
    return false;
  }

  if (!filters.cityKey && !filters.state) {
    return true;
  }

  const locations = result.locations
    .map(parseLocation)
    .filter((location): location is ParsedLocation => Boolean(location));
  return locations.some(
    (location) =>
      (!filters.state || location.state === filters.state) &&
      (!filters.cityKey || location.key === filters.cityKey),
  );
}

function matchesAgeFilter(ageRange: string, filter: AgeFilter) {
  const range = parseAgeRange(ageRange);
  if (filter === "unknown") {
    return range === null;
  }

  const bucket = AGE_BUCKETS.find((item) => item.value === filter);
  return Boolean(range && bucket && rangesOverlap(range, bucket));
}

function parseAgeRange(ageRange: string) {
  const normalized = ageRange.trim();
  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  const bornMatch = normalized.match(/\bBorn\s+(\d{4})\b/i);
  if (bornMatch) {
    const age = new Date().getFullYear() - Number(bornMatch[1]);
    return { min: age, max: age };
  }

  const rangeMatch = normalized.match(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
    };
  }

  const ageMatch = normalized.match(/\b(?:Age\s*)?(\d{1,3})\b/i);
  if (ageMatch) {
    const age = Number(ageMatch[1]);
    return { min: age, max: age };
  }

  return null;
}

function rangesOverlap(
  left: { min: number; max: number },
  right: { min: number; max: number },
) {
  return left.min <= right.max && right.min <= left.max;
}

function parseLocation(location: string) {
  const parts = location.split(",").map((part) => part.trim());
  if (parts.length < 2) {
    return null;
  }

  const state = parts.at(-1)?.toUpperCase();
  const city = parts.slice(0, -1).join(", ");
  if (!city || !state || state.length !== 2) {
    return null;
  }

  return { city, key: `${city}|${state}`, state };
}
