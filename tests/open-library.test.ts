import { describe, expect, it } from "vitest";
import { mapOpenLibraryAuthorToProfileInput } from "@/lib/sources/open-library";

describe("Open Library source mapping", () => {
  it("maps matching authors to library context profiles", () => {
    const profile = mapOpenLibraryAuthorToProfileInput("Jane Smith", {
      key: "OL123A",
      name: "Jane Smith",
      birth_date: "1962",
      top_work: "How do you sleep?",
      work_count: 54,
      top_subjects: ["Teaching", "Pain", "Alphabet books"],
    });

    expect(profile?.id).toBe("p_openlibrary_ol123a");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.ageRange).toBe("Born 1962");
    expect(profile?.aliases).toContain("Open Library author key: OL123A");
    expect(profile?.aliases).toContain("Top work: How do you sleep?");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Open Library",
      state: "Global",
      kind: "library author metadata",
    });
  });

  it("skips nonmatching authors", () => {
    expect(
      mapOpenLibraryAuthorToProfileInput("Jane Smith", {
        key: "OL999A",
        name: "Alex Jones",
      }),
    ).toBeNull();
  });

  it("skips long title-like author strings for ambiguous names", () => {
    expect(
      mapOpenLibraryAuthorToProfileInput("Mai Ren", {
        key: "OL888A",
        name: "Bai, Shan Ren mai sheng yu neng li 人脉胜于能力 Beijing Shi",
      }),
    ).toBeNull();
  });
});
