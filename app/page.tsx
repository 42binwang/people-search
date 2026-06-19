import Link from "next/link";
import {
  ShieldCheck,
  SlidersHorizontal,
  Database,
  Ban,
  Sparkles,
} from "lucide-react";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <div className="content">
      <div className="home-layout">
        <section aria-labelledby="home-title">
          <p className="eyebrow">AI-based people search</p>
          <h1 id="home-title">Search People with smarter public-record matching.</h1>
          <p className="lede">
            Search People uses AI-assisted matching signals to organize public
            and licensed-record context for name, phone, and address lookup,
            with privacy controls and removal workflows built in.
          </p>
          <div className="search-surface" aria-label="Search">
            <SearchForm />
          </div>
        </section>
        <aside className="info-rail" aria-label="Service notices">
          <div className="ad-slot">Ad placement preview</div>
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
              <ShieldCheck size={17} aria-hidden="true" /> Not for screening
            </strong>
            <p className="fine-print">
              This service may not be used for employment, tenant screening,
              credit, insurance, or eligibility decisions.
            </p>
          </div>
          <div className="info-band">
            <strong>
              <SlidersHorizontal size={17} aria-hidden="true" /> Removal controls
            </strong>
            <p className="fine-print">
              Public profiles include correction, report, and opt-out paths.
            </p>
          </div>
          <div className="info-band">
            <strong>
              <Database size={17} aria-hidden="true" /> Approved sources only
            </strong>
            <p className="fine-print">
              Displayed records are designed around source approval,
              provenance, and privacy-safe handling.
            </p>
          </div>
          <div className="notice">
            <Ban size={16} aria-hidden="true" /> Detailed profile data requires
            prohibited-use attestation.
          </div>
          <Link className="button secondary" href="/opt-out">
            Remove my info
          </Link>
        </aside>
      </div>
    </div>
  );
}
