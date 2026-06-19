import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, RotateCcw, ShieldAlert } from "lucide-react";
import { getMockResults } from "@/lib/mock-data";
import { getStoredSearch } from "@/lib/search-store";

export const metadata: Metadata = {
  title: "Search Results",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const storedSearch = getStoredSearch(token);

  if (!storedSearch) {
    return (
      <div className="content">
        <section className="legal-panel">
          <h1>Search expired</h1>
          <p>
            Search sessions are temporary in this prototype. Start a new search
            to generate a fresh privacy-safe results URL.
          </p>
          <Link className="button" href="/">
            <RotateCcw size={17} aria-hidden="true" />
            New search
          </Link>
        </section>
      </div>
    );
  }

  const results = getMockResults(storedSearch.payload);

  return (
    <div className="content">
      <section className="results-header">
        <p className="eyebrow">{storedSearch.payload.mode} search</p>
        <h1>Possible matches</h1>
        <p className="lede">
          Results are ranked prototype matches. Production profiles will require
          approved sources, field provenance, suppression checks, and abuse
          controls before display.
        </p>
        <div className="notice">
          <ShieldAlert size={16} aria-hidden="true" /> This is not a consumer
          report and may not be used for employment, tenant screening, credit,
          insurance, or eligibility decisions.
        </div>
      </section>

      <div className="results-grid">
        <div className="result-list" aria-label="Search results">
          {results.map((result) => (
            <article className="result-card" key={result.id}>
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
              <Link className="button secondary" href={`/profile/${result.id}`}>
                View
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>

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
      </div>
    </div>
  );
}

