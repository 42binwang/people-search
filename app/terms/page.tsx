import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
};

export default function TermsPage() {
  return (
    <div className="content">
      <article className="legal-panel">
        <p className="eyebrow">Draft terms</p>
        <h1>Terms of Use</h1>
        <p>
          This service is not a consumer reporting agency and does not provide
          consumer reports.
        </p>
        <h2>Prohibited uses</h2>
        <ul>
          <li>Employment screening.</li>
          <li>Tenant screening.</li>
          <li>Credit, insurance, or eligibility decisions.</li>
          <li>Stalking, harassment, intimidation, identity theft, or unlawful activity.</li>
        </ul>
        <h2>Accuracy</h2>
        <p>
          Information may be inaccurate, incomplete, or outdated. Production
          profiles must provide correction, reporting, and removal pathways.
        </p>
      </article>
    </div>
  );
}

