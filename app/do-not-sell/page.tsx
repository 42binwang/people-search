import type { Metadata } from "next";
import { SimpleForm } from "@/components/simple-form";

export const metadata: Metadata = {
  title: "Do Not Sell or Share",
  robots: {
    index: true,
    follow: false,
  },
};

export default function DoNotSellPage() {
  return (
    <div className="content">
      <section className="legal-panel">
        <p className="eyebrow">Privacy rights</p>
        <h1>Do Not Sell or Share</h1>
        <p>
          Production privacy requests will be tracked separately from ordinary
          opt-outs and routed according to jurisdiction-specific deadlines.
        </p>
      </section>
      <SimpleForm type="do-not-sell" />
    </div>
  );
}

