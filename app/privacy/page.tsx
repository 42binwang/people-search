import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="content">
      <article className="legal-panel">
        <p className="eyebrow">Draft policy</p>
        <h1>Privacy Policy</h1>
        <p>
          This prototype does not use production people-search data. Production
          data collection will require approved sources, field provenance,
          privacy request handling, and suppression enforcement.
        </p>
        <h2>Advertising</h2>
        <p>
          Ad integrations must not receive searched names, phone numbers,
          emails, street addresses, profile details, or sensitive workflow data.
        </p>
        <h2>Removal</h2>
        <p>
          Approved removal requests will suppress matching public profiles and
          prevent them from being republished through future imports.
        </p>
      </article>
    </div>
  );
}

