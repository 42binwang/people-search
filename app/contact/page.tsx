import type { Metadata } from "next";
import { SimpleForm } from "@/components/simple-form";

export const metadata: Metadata = {
  title: "Contact",
};

export default function ContactPage() {
  return (
    <div className="content">
      <section className="legal-panel">
        <p className="eyebrow">Support</p>
        <h1>Contact</h1>
        <p>
          Use this page for product questions, source issues, or policy
          concerns.
        </p>
      </section>
      <SimpleForm type="contact" />
    </div>
  );
}

