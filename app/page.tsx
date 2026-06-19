import Link from "next/link";
import { ShieldCheck, SlidersHorizontal, Database, Ban } from "lucide-react";
import { SearchForm } from "@/components/search-form";

export default function HomePage() {
  return (
    <div className="content">
      <div className="home-layout">
        <section aria-labelledby="home-title">
          <p className="eyebrow">Free public lookup</p>
          <h1 id="home-title">Find possible people, phone, and address records.</h1>
          <p className="lede">
            Search public and licensed-record profiles with privacy controls,
            source governance, and removal workflows built into the product.
          </p>
          <div className="search-surface" aria-label="Search">
            <SearchForm />
          </div>
        </section>
        <aside className="info-rail" aria-label="Service notices">
          <div className="ad-slot">Ad placement preview</div>
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
              The production data pipeline will require field-level provenance
              and source approval before records can be displayed.
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

