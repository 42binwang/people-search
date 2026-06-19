import { describe, expect, it } from "vitest";
import { mapFederalRegisterDocumentToProfileInput } from "@/lib/sources/federal-register";

describe("Federal Register source mapping", () => {
  it("maps document hits to low-confidence mention profiles", () => {
    const profile = mapFederalRegisterDocumentToProfileInput("Jane Smith", {
      document_number: "2026-12345",
      title: "Advisory Committee Appointment for Jane Smith",
      publication_date: "2026-06-01",
      agencies: [{ name: "Example Agency" }],
    });

    expect(profile?.id).toBe("p_fr_jane_smith_2026-12345");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.confidence).toBe("Low");
    expect(profile?.aliases).toContain(
      "Federal Register mention: Advisory Committee Appointment for Jane Smith",
    );
    expect(profile?.aliases).toContain("Agency: Example Agency");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Federal Register",
      state: "US",
      kind: "public document mention",
    });
  });
});

