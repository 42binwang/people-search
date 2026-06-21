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

  it("sets confidence Medium and ageRange Unknown for a mapped PI", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 3,
        title: "Award",
        awardeeName: "Org",
        awardeeCountryCode: "US",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "2020-01-01",
      },
      "Jane Smith",
    );
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
  });

  it("falls back to 'Global' state when awardeeCountryCode is missing but institution is present", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 4,
        title: "Award",
        awardeeName: "University of Toronto",
        piFirstName: "Jane",
        piLastName: "Smith",
      },
      "Jane Smith",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "University of Toronto",
      state: "Global",
      kind: "scholarly affiliation",
    });
  });

  it("omits location and institution alias when awardeeName is missing", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 5,
        title: "Award",
        awardeeCountryCode: "US",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "2018-05-01",
      },
      "Jane Smith",
    );
    expect(profile?.locations).toEqual([]);
    expect(
      profile?.aliases?.some((a) => a.startsWith("Last known institution")),
    ).toBe(false);
    expect(profile?.aliases).toContain("Year: 2018");
  });

  it("omits year alias when startDate is missing or has no 4-digit year", () => {
    const noDate = mapNsfAwardToProfileInput(
      {
        id: 6,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
      },
      "Jane Smith",
    );
    expect(noDate?.aliases?.some((a) => a.startsWith("Year:"))).toBe(false);

    const noYear = mapNsfAwardToProfileInput(
      {
        id: 7,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "TBD",
      },
      "Jane Smith",
    );
    expect(noYear?.aliases?.some((a) => a.startsWith("Year:"))).toBe(false);
  });

  it("extracts the year from a non-ISO date string", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 8,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "Award started March 2021",
      },
      "Jane Smith",
    );
    expect(profile?.aliases).toContain("Year: 2021");
  });

  it("uses the 'award' placeholder when award id is absent", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
      },
      "Jane Smith",
    );
    expect(profile?.sourceRecord?.sourceRecordId).toBe("award__jane_smith");
  });

  it("maps a minimal award with only institution context when fullName is present", () => {
    const profile = mapNsfAwardToProfileInput(
      { awardeeName: "MIT", awardeeCountryCode: "US" },
      "Jane Smith",
    );
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.locations?.[0]?.city).toBe("MIT");
    expect(profile?.aliases).toEqual(["Last known institution: MIT"]);
  });
});
