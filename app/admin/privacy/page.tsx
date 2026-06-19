import type { Metadata } from "next";
import Link from "next/link";
import { listPrivacyRequests } from "@/lib/db";

export const metadata: Metadata = {
  title: "Privacy Requests Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default function PrivacyAdminPage() {
  const requests = listPrivacyRequests();

  return (
    <div className="content">
      <section className="legal-panel">
        <p className="eyebrow">Local admin</p>
        <h1>Privacy requests</h1>
        <p>
          Local prototype queue. Production must put this behind authenticated
          admin access with MFA and role-based permissions.
        </p>
      </section>

      <div className="result-list">
        {requests.length === 0 && (
          <section className="legal-panel">
            <h2>No privacy requests yet</h2>
            <p>Submitted opt-out and privacy requests will appear here.</p>
          </section>
        )}

        {requests.map((request) => (
          <article className="result-card" key={request.id}>
            <div>
              <div className="result-title">
                <h2>Request #{request.id}</h2>
                <span className="confidence">{request.status}</span>
              </div>
              <p className="meta">
                {request.type} · {request.createdAt}
              </p>
              <p className="fine-print">
                {request.requesterName} · {request.requesterEmail}
              </p>
              {request.profileId && (
                <p className="fine-print">
                  Profile:{" "}
                  <Link href={`/profile/${request.profileId}`}>
                    {request.profileId}
                  </Link>
                </p>
              )}
              <p>{request.details}</p>
            </div>

            {request.status !== "approved" ? (
              <form action={`/admin/privacy/${request.id}/approve`} method="post">
                <button className="button" type="submit">
                  Approve suppression
                </button>
              </form>
            ) : (
              <span className="notice">Suppression approved</span>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
