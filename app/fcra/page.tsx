import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FCRA Disclaimer",
};

export default function FcraPage() {
  return (
    <div className="content">
      <article className="legal-panel">
        <p className="eyebrow">FCRA disclaimer</p>
        <h1>Not a consumer report</h1>
        <p>
          This service is not a consumer reporting agency as defined by the Fair
          Credit Reporting Act. It may not be used to determine eligibility for
          employment, housing, credit, insurance, or any other FCRA-regulated
          purpose.
        </p>
        <p>
          Any production release must complete legal review before launch.
        </p>
      </article>
    </div>
  );
}

