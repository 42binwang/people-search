import { describe, expect, it } from "vitest";
import { mapOrcidRecordToProfileInput } from "@/lib/sources/orcid";

describe("ORCID source mapping", () => {
  it("maps matching public records to researcher identifier profiles", () => {
    const profile = mapOrcidRecordToProfileInput("Jane Smith", {
      "orcid-id": "0000-0002-1825-0097",
      "given-names": "Jane",
      "family-names": "Smith",
      "credit-name": "Jane Smith",
      "other-name": ["J. Smith"],
      "institution-name": ["Example University"],
    });

    expect(profile?.id).toBe("p_orcid_0000_0002_1825_0097");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.aliases).toContain("ORCID iD: 0000-0002-1825-0097");
    expect(profile?.aliases).toContain("Other ORCID name: J. Smith");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Example University",
      state: "ORCID public metadata",
      kind: "researcher affiliation metadata",
    });
  });

  it("skips nonmatching public records", () => {
    expect(
      mapOrcidRecordToProfileInput("Jane Smith", {
        "orcid-id": "0000-0000-0000-0000",
        "credit-name": "Alex Jones",
      }),
    ).toBeNull();
  });
});
