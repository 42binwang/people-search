import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BadgeInfo, Flag, UserRoundX } from "lucide-react";
import { ProfileDetailGate } from "@/components/profile-detail-gate";
import { getMockProfile } from "@/lib/mock-data";

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
  const profile = getMockProfile(id);

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
                  Age {profile.ageRange} · {profile.locations.join(" · ")}
                </p>
              </div>
              <span className="confidence">{profile.confidence}</span>
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
            <ul className="data-list">
              <li>
                <span>Aliases</span>
                <strong>{profile.aliases.join(", ")}</strong>
              </li>
              <li>
                <span>Possible locations</span>
                <strong>{profile.locations.join(", ")}</strong>
              </li>
              <li>
                <span>Possible relatives</span>
                <strong>{profile.relatives.join(", ")}</strong>
              </li>
              <li>
                <span>Source categories</span>
                <strong>{profile.sourceCategories.join(", ")}</strong>
              </li>
            </ul>
          </section>

          <ProfileDetailGate>
            <ul className="data-list">
              <li>
                <span>Possible phones</span>
                <strong>{profile.phones.join(", ")}</strong>
              </li>
              <li>
                <span>Possible emails</span>
                <strong>{profile.emails.join(", ")}</strong>
              </li>
              <li>
                <span>Address history</span>
                <strong>{profile.addresses.join(", ")}</strong>
              </li>
            </ul>
          </ProfileDetailGate>
        </main>

        <aside className="info-rail" aria-label="Profile actions">
          <div className="ad-slot">Ad placement preview</div>
          <Link className="button secondary" href="/opt-out">
            <UserRoundX size={17} aria-hidden="true" />
            Remove my info
          </Link>
          <Link className="button secondary" href="/report">
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

