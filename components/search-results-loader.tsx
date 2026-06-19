"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
          {results.length === 0 && (
            <section className="legal-panel">
              <h2>No matches found</h2>
              <p>
                Try another search. Approved sources are checked automatically
                for name searches when their source refresh is stale.
              </p>
            </section>
          )}
          {results.map((result) => (
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
