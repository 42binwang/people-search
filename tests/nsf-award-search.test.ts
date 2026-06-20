import { describe, expect, it } from "vitest";
import { mapNsfAwardToProfileInput } from "@/lib/sources/nsf-award-search";

describe("NSF Award Search source mapping", () => {
  it("maps an award PI to a context profile", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 8611317,
        title: "Development of New Software for Genetic Linkage Mapping",
        awardeeName: "Whitehead Institute for Biomedical Research",
        awardeeCountryCode: "US",
        piFirstName: "Eric",
        piLastName: "Lander",
        startDate: "01/15/1987",
        fundsObligatedAmt: 1197532,
      },
      "Eric Lander",
    );

    expect(profile?.id).toBe("p_nsf_eric_lander");
    expect(profile?.fullName).toBe("Eric Lander");
    expect(profile?.aliases).toContain(
      "Last known institution: Whitehead Institute for Biomedical Research",
    );
    expect(profile?.aliases).toContain("Year: 1987");
    expect(profile?.sourceRecord?.sourceId).toBe("nsf_award_search");
    expect(profile?.sourceRecord?.sourceRecordId).toBe("8611317__eric_lander");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Whitehead Institute for Biomedical Research",
      state: "US",
      kind: "scholarly affiliation",
    });
  });

  it("returns null for an empty PI name", () => {
    expect(
      mapNsfAwardToProfileInput(
        { id: 1, title: "Any award", awardeeName: "Any Org" },
        "",
      ),
    ).toBeNull();
  });

  it("parses a 4-digit year from various NSF date formats", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 2,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "2024-06-01",
      },
      "Jane Smith",
    );
    expect(profile?.aliases).toContain("Year: 2024");
  });
});
