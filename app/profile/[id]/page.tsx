import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeInfo, Flag, UserRoundX } from "lucide-react";
import { ProfileDetailGate } from "@/components/profile-detail-gate";
import { RecordFeedbackButtons } from "@/components/record-feedback-buttons";
import type { AddressHistoryEntry } from "@/lib/db";
import { getProfile } from "@/lib/db";

export const metadata: Metadata = {
  title: "Profile",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = getProfile(id);

  if (!profile) {
    notFound();
  }

  return (
    <div className="content">
      <div className="profile-layout">
        <main>
          <section className="profile-section">
            <div className="profile-header">
              <div>
                <p className="eyebrow">Possible profile</p>
                <h1>{profile.name}</h1>
                <p className="lede">
                  Age {profile.ageRange}
                  {profile.locations.length > 0
                    ? ` · ${profile.locations.join(" · ")}`
                    : " · No geographic locations found"}
                </p>
              </div>
              <div className="profile-header-actions">
                <span className="confidence">{profile.confidence}</span>
                <RecordFeedbackButtons context="profile" profileId={profile.id} />
              </div>
            </div>
            <div className="notice">
              <AlertTriangle size={16} aria-hidden="true" /> Profile data may be
              inaccurate, incomplete, or outdated.
            </div>
          </section>

          <section className="profile-section">
            <h2>
              <BadgeInfo size={20} aria-hidden="true" /> Public summary
            </h2>
            <PublicSummary
              aliases={profile.aliases}
              locations={profile.locations}
              relatives={profile.relatives}
              sourceCategories={profile.sourceCategories}
            />
          </section>

          <ProfileDetailGate>
            <ul className="data-list">
              <li>
                <span>Possible phones</span>
                <strong>{formatInlineList(profile.phones)}</strong>
              </li>
              <li>
                <span>Possible emails</span>
                <strong>{formatInlineList(profile.emails)}</strong>
              </li>
            </ul>
            <AddressHistory addresses={profile.addressHistory} />
          </ProfileDetailGate>
        </main>

        <aside className="info-rail" aria-label="Profile actions">
          <div className="ad-slot">Ad placement preview</div>
          <Link className="button secondary" href={`/opt-out?profile=${profile.id}`}>
            <UserRoundX size={17} aria-hidden="true" />
            Remove my info
          </Link>
          <Link className="button secondary" href={`/report?profile=${profile.id}`}>
            <Flag size={17} aria-hidden="true" />
            Report data
          </Link>
          <div className="notice">
            This service is not a consumer reporting agency and does not provide
            consumer reports.
          </div>
        </aside>
      </div>
    </div>
  );
}

function AddressHistory({ addresses }: { addresses: AddressHistoryEntry[] }) {
  const streetLevel = addresses.filter(
    (address) => address.street || address.zip,
  );
  const cityLevel = addresses.filter(
    (address) => !address.street && !address.zip,
  );

  return (
    <section className="address-history" aria-labelledby="address-history-title">
      <div className="section-heading-row">
        <div>
          <h3 id="address-history-title">Location history</h3>
          <p className="fine-print">
            Source-backed geographic records are shown here. Source platforms
            such as arXiv or Internet Archive are excluded because they are not
            places this person lived or moved through.
          </p>
        </div>
      </div>

      {streetLevel.length > 0 ? (
        <div className="address-card-grid" aria-label="Street-level addresses">
          {streetLevel.map((address) => (
            <AddressCard key={address.address} address={address} />
          ))}
        </div>
      ) : (
        <p className="notice">
          No street-level addresses are available from the approved geographic
          sources currently attached to this profile.
        </p>
      )}

      {cityLevel.length > 0 && (
        <details className="city-context">
          <summary>Show city-level movement context</summary>
          <ol className="movement-list">
            {cityLevel.slice(0, 8).map((address) => (
              <li key={address.address}>
                <span>{address.address}</span>
                <small>{formatAddressType(address.kinds)}</small>
              </li>
            ))}
            {cityLevel.length > 8 && (
              <li className="muted">+{cityLevel.length - 8} more</li>
            )}
          </ol>
        </details>
      )}
    </section>
  );
}

function AddressCard({ address }: { address: AddressHistoryEntry }) {
  return (
    <article className="address-card">
      <div>
        <p className="address-line">{address.address}</p>
        <p className="fine-print">
          {formatAddressType(address.kinds)} · source-observed location
        </p>
      </div>
      <dl className="address-meta">
        <div>
          <dt>Source</dt>
          <dd>{formatInlineList(address.sources)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{formatInlineList(address.sourceCategories)}</dd>
        </div>
      </dl>
    </article>
  );
}

function PublicSummary({
  aliases,
  locations,
  relatives,
  sourceCategories,
}: {
  aliases: string[];
  locations: string[];
  relatives: string[];
  sourceCategories: string[];
}) {
  const summary = organizePublicSummaryAliases(aliases);

  return (
    <div className="summary-grid">
      <SummaryCard title="Names and aliases" values={summary.names} />
      <SummaryCard title="Possible locations" values={locations} />
      <SummaryCard title="Possible relatives" values={relatives} />
      <SummaryCard title="Source types" values={sourceCategories} />
      <SummaryCard
        title="Source notes"
        values={summary.notes}
        className="summary-card wide"
      />
    </div>
  );
}

function SummaryCard({
  title,
  values,
  className = "summary-card",
}: {
  title: string;
  values: string[];
  className?: string;
}) {
  const visibleValues = values.slice(0, 8);
  const hiddenCount = Math.max(0, values.length - visibleValues.length);

  return (
    <section className={className}>
      <h3>{title}</h3>
      {visibleValues.length > 0 ? (
        <ul className="summary-list">
          {visibleValues.map((value) => (
            <li key={value}>{formatSummaryValue(value)}</li>
          ))}
          {hiddenCount > 0 && <li className="muted">+{hiddenCount} more</li>}
        </ul>
      ) : (
        <p className="fine-print">No public entries shown.</p>
      )}
    </section>
  );
}

function organizePublicSummaryAliases(aliases: string[]) {
  const names: string[] = [];
  const notes: string[] = [];

  for (const alias of uniqueValues(aliases)) {
    if (isHiddenSourceAlias(alias)) {
      continue;
    }

    if (isSourceNoteAlias(alias)) {
      notes.push(cleanSourceNote(alias));
      continue;
    }

    if (isReadablePersonAlias(alias)) {
      names.push(alias);
    }
  }

  return {
    names,
    notes,
  };
}

function isHiddenSourceAlias(value: string) {
  return [
    "LOC ID:",
    "Resource:",
    "arXiv entry:",
    "Semantic Scholar profile:",
    "Library of Congress result:",
    "Archive identifier:",
    "Open Library author key:",
    "ORCID iD:",
    "ISNI:",
    "DOI:",
    "PMID:",
  ].some((prefix) => value.startsWith(prefix));
}

function isSourceNoteAlias(value: string) {
  return [
    "arXiv preprint:",
    "Published:",
    "Internet Archive item:",
    "Year:",
    "Works indexed by OpenAlex:",
    "Cited by count:",
    "Last known institution:",
    "GitHub username:",
    "GitHub profile:",
    "Public repositories:",
    "Followers:",
    "Publication:",
    "Container:",
    "Semantic Scholar author ID:",
    "Paper count:",
    "Citation count:",
    "h-index:",
    "Federal Register mention:",
    "Publication date:",
    "Top work:",
    "Work count:",
    "Subjects:",
    "Professional category:",
    "Occupation:",
    "Employer:",
    "Party:",
    "Office:",
    "Agency:",
    "Source updated:",
  ].some((prefix) => value.startsWith(prefix));
}

function isReadablePersonAlias(value: string) {
  if (value.length > 80 || value.includes("http://") || value.includes("https://")) {
    return false;
  }

  const tokenCount = value
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return tokenCount > 0 && tokenCount <= 6;
}

function cleanSourceNote(value: string) {
  if (value.startsWith("GitHub profile:")) {
    return "GitHub profile available";
  }

  if (value.length <= 140) {
    return value;
  }

  return `${value.slice(0, 137).trim()}...`;
}

function formatSummaryValue(value: string) {
  return value || "Unknown";
}

function formatInlineList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None found";
}

function formatAddressType(kinds: string[]) {
  return kinds.length > 0 ? kinds.join(", ") : "possible address";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
