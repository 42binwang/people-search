import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Request Submitted",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RequestSubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>;
}) {
  const { kind, id } = await searchParams;

  return (
    <div className="content">
      <section className="legal-panel">
        <p className="eyebrow">{kind === "report" ? "Report" : "Privacy request"}</p>
        <h1>Request submitted</h1>
        <p>
          Your request was saved with local tracking ID {id ?? "unknown"}. In
          production this step will send a confirmation email and start identity
          verification where required.
        </p>
        <div className="button-row">
          <Link className="button" href="/">
            Return to search
          </Link>
          <Link className="button secondary" href="/admin/privacy">
            Local admin queue
          </Link>
        </div>
      </section>
    </div>
  );
}

