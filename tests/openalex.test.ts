import { describe, expect, it } from "vitest";
import { mapOpenAlexAuthorToProfileInput } from "@/lib/sources/openalex";

describe("OpenAlex source mapping", () => {
  it("maps scholarly authors to context profiles", () => {
    const profile = mapOpenAlexAuthorToProfileInput({
      id: "https://openalex.org/A123456789",
      display_name: "Jane Q Smith",
      orcid: "https://orcid.org/0000-0002-1825-0097",
      works_count: 42,
      cited_by_count: 777,
      last_known_institutions: [
        {
          display_name: "Example University",
          country_code: "US",
        },
      ],
    });

    expect(profile?.id).toBe("p_openalex_A123456789");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.aliases).toContain("ORCID: https://orcid.org/0000-0002-1825-0097");
    expect(profile?.aliases).toContain("Works indexed by OpenAlex: 42");
    expect(profile?.aliases).toContain("Cited by count: 777");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Example University",
      state: "US",
      kind: "scholarly affiliation",
    });
  });

  it("skips authors without stable id or name", () => {
    expect(
      mapOpenAlexAuthorToProfileInput({
        id: "",
        display_name: "Jane Smith",
      }),
    ).toBeNull();
  });
});

