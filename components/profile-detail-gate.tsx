"use client";

import { useState } from "react";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";

export function ProfileDetailGate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [accepted, setAccepted] = useState(false);

  if (accepted) {
    return (
      <section className="profile-section">
        <h2>
          <UnlockKeyhole size={20} aria-hidden="true" /> Detailed possible data
        </h2>
        {children}
      </section>
    );
  }

  return (
    <section className="profile-section locked">
      <h2>
        <LockKeyhole size={20} aria-hidden="true" /> Detailed data locked
      </h2>
      <p className="fine-print">
        You must confirm this information will not be used for employment,
        tenant screening, credit, insurance, eligibility decisions, stalking,
        harassment, identity theft, or unlawful activity.
      </p>
      <button className="button" type="button" onClick={() => setAccepted(true)}>
        I agree
      </button>
    </section>
  );
}

