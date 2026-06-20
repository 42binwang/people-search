import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw, ShieldAlert } from "lucide-react";
import { SearchResultsLoader } from "@/components/search-results-loader";
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

  const payload = storedSearch.payload;

  return (
    <div className="content">
      <section className="results-header">
        <p className="eyebrow">{payload.mode} search</p>
        <h1>Possible matches</h1>
        <div className="notice">
          <ShieldAlert size={16} aria-hidden="true" /> This is not a consumer
          report and may not be used for employment, tenant screening, credit,
          insurance, or eligibility decisions.
        </div>
      </section>

      <SearchResultsLoader mode={payload.mode} token={token} />
    </div>
  );
}
