import { describe, expect, it } from "vitest";
import { mapSemanticScholarAuthorToProfileInput } from "@/lib/sources/semantic-scholar";

describe("Semantic Scholar source mapping", () => {
  it("maps matching authors to scholarly context profiles", () => {
    const profile = mapSemanticScholarAuthorToProfileInput("Jane Smith", {
      authorId: "123456",
      name: "Jane Smith",
      url: "https://www.semanticscholar.org/author/123456",
      homepage: "https://example.edu/jane",
      affiliations: ["Example University"],
      paperCount: 42,
      citationCount: 500,
      hIndex: 11,
      externalIds: {
        ORCID: ["0000-0002-1825-0097"],
      },
    });

    expect(profile?.id).toBe("p_semanticscholar_123456");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.aliases).toContain("Semantic Scholar author ID: 123456");
    expect(profile?.aliases).toContain("ORCID: 0000-0002-1825-0097");
    expect(profile?.aliases).toContain("Paper count: 42");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Example University",
      state: "Semantic Scholar metadata",
      kind: "scholarly affiliation",
    });
  });

  it("skips nonmatching authors", () => {
    expect(
      mapSemanticScholarAuthorToProfileInput("Jane Smith", {
        authorId: "999",
        name: "Alex Jones",
      }),
    ).toBeNull();
  });
});
