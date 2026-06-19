import type { Metadata } from "next";
import { SimpleForm } from "@/components/simple-form";

export const metadata: Metadata = {
  title: "Opt Out",
  robots: {
    index: true,
    follow: false,
  },
};

export default function OptOutPage() {
  return (
    <div className="content">
      <section className="legal-panel">
        <p className="eyebrow">Removal request</p>
        <h1>Opt out</h1>
        <p>
          Production removal requests will verify the request, suppress the
          matching public profile, and prevent approved records from reappearing
          after future imports.
        </p>
      </section>
      <SimpleForm type="opt-out" />
    </div>
  );
}

