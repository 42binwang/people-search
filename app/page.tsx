import Link from "next/link";
import {
  ShieldCheck,
  SlidersHorizontal,
  Database,
  Ban,
  Sparkles,
  Search,
} from "lucide-react";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <div className="content home-content">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">AI-based people search</p>
        <h1 id="home-title">Find people faster with AI-assisted search.</h1>
        <p className="lede">
          Search by name, phone, email, or address. Search People analyzes
          approved public and licensed-record sources, then uses matching
          signals to organize possible profiles with source context.
        </p>
        <div className="home-search-shell">
          <div className="search-surface" aria-label="Search">
            <SearchForm />
          </div>
        </div>
      </section>

      <section className="home-ad-row" aria-label="Sponsored placement">
        <div className="ad-slot">Ad placement preview</div>
      </section>

      <section className="home-highlights" aria-label="Search safeguards">
        <div className="info-band">
          <strong>
            <Sparkles size={17} aria-hidden="true" /> AI-assisted matching
          </strong>
          <p className="fine-print">
            Ranking and source signals help group possible matches while
            preserving source provenance.
          </p>
        </div>
        <div className="info-band">
          <strong>
            <Database size={17} aria-hidden="true" /> Approved sources only
          </strong>
          <p className="fine-print">
            Displayed records are designed around source approval, provenance,
            and privacy-safe handling.
          </p>
        </div>
        <div className="info-band">
          <strong>
            <ShieldCheck size={17} aria-hidden="true" /> Not for screening
          </strong>
          <p className="fine-print">
            This service may not be used for employment, tenant screening,
            credit, insurance, or eligibility decisions.
          </p>
        </div>
      </section>

      <section className="privacy-strip" aria-labelledby="privacy-title">
        <div>
          <p className="eyebrow">Privacy controls</p>
          <h2 id="privacy-title">Need to remove or correct a record?</h2>
          <p className="fine-print">
            Public profiles include correction, report, and opt-out paths.
            Detailed profile data requires prohibited-use attestation.
          </p>
        </div>
        <div className="privacy-actions">
          <Link className="button secondary" href="/opt-out">
            <SlidersHorizontal size={17} aria-hidden="true" />
            Remove my info
          </Link>
          <Link className="button secondary" href="/fcra">
            <Ban size={17} aria-hidden="true" />
            FCRA notice
          </Link>
        </div>
      </section>

      <section className="quick-search-note" aria-label="Search summary">
        <Search size={18} aria-hidden="true" />
        <span>Start with a name, phone number, email, or address above.</span>
      </section>
    </div>
  );
}
