import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeInfo, Flag, UserRoundX } from "lucide-react";
import { ProfileDetailGate } from "@/components/profile-detail-gate";
import { RecordFeedbackButtons } from "@/components/record-feedback-buttons";
import { SummaryCard } from "@/components/summary-card";
import type { AddressHistoryEntry } from "@/lib/db";
import { getProfile, getSourceRecordsForProfile } from "@/lib/db";
import { normalizeProfileRecords } from "@/lib/profile-source-records";
import { organizePublicSummaryAliases } from "@/lib/profile-summary";

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

  const { works, profiles: accountProfiles } = normalizeProfileRecords(
    getSourceRecordsForProfile(profile.id),
  );
  const hasDetailedData =
    profile.phones.length > 0 ||
    profile.emails.length > 0 ||
    profile.addressHistory.length > 0;

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
                  {[
                    hasAgeRange(profile.ageRange)
                      ? `Age ${profile.ageRange}`
                      : null,
                    profile.locations.length > 0
                      ? profile.locations.join(" · ")
                      : "No geographic locations found",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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

          {works.length > 0 && <PublicationsAndWorks works={works} />}
          {accountProfiles.length > 0 && (
            <ProfilesAndAccounts profiles={accountProfiles} />
          )}

          {hasDetailedData && (
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
          )}
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
      {summary.notes.length > 0 && (
        <SummaryCard
          title="Source notes"
          values={summary.notes}
          className="summary-card wide"
          initialLimit={summary.noteDefaultLimit}
        />
      )}
    </div>
  );
}

function PublicationsAndWorks({
  works,
}: {
  works: ReturnType<typeof normalizeProfileRecords>["works"];
}) {
  return (
    <section className="profile-section">
      <h2>Publications and works</h2>
      <ul className="record-list">
        {works.map((work) => (
          <li className="record-item" key={work.title}>
            <p className="record-title">
              {work.url ? (
                <a href={work.url} rel="nofollow noopener" target="_blank">
                  {work.title}
                </a>
              ) : (
                work.title
              )}
            </p>
            <p className="fine-print">
              {[work.detail, work.sources.join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProfilesAndAccounts({
  profiles,
}: {
  profiles: ReturnType<typeof normalizeProfileRecords>["profiles"];
}) {
  return (
    <section className="profile-section">
      <h2>Profiles and accounts</h2>
      <ul className="record-list">
        {profiles.map((profile) => (
          <li className="record-item" key={`${profile.label}-${profile.url ?? ""}`}>
            <p className="record-title">
              {profile.url ? (
                <a href={profile.url} rel="nofollow noopener" target="_blank">
                  {profile.label}
                </a>
              ) : (
                profile.label
              )}
            </p>
            <p className="fine-print">{profile.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatInlineList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None found";
}

function formatAddressType(kinds: string[]) {
  return kinds.length > 0 ? kinds.join(", ") : "possible address";
}

function hasAgeRange(ageRange: string) {
  const value = ageRange.trim().toLowerCase();
  return value.length > 0 && value !== "unknown";
}
