import type { Metadata } from "next";
import { SimpleForm } from "@/components/simple-form";

export const metadata: Metadata = {
  title: "Report Data",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ReportPage() {
  return (
    <div className="content">
      <section className="legal-panel">
        <p className="eyebrow">Safety and accuracy</p>
        <h1>Report incorrect or harmful data</h1>
        <p>
          Reports will enter an admin review queue with profile, source, and
          field-level audit history.
        </p>
      </section>
      <SimpleForm type="report" />
    </div>
  );
}

