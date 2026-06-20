import { describe, expect, it } from "vitest";
import { mapChroniclingAmericaItemToProfileInput } from "@/lib/sources/chronicling-america";

describe("Chronicling America source mapping", () => {
  it("maps a newspaper page to a context profile", () => {
    const profile = mapChroniclingAmericaItemToProfileInput(
      {
        id: "http://www.loc.gov/resource/sn89081128/1915-02-10/ed-1/?sp=15",
        title: "Image 15 of New Ulm Review (New Ulm, Minn.), February 10, 1915",
        date: "1915-02-10",
        partof_title: "new ulm review (new ulm, brown county, minn.) 1892-1961",
        location_city: ["new ulm"],
        location_state: ["minnesota"],
        location_country: ["united states"],
        description: ["Abraham Lincoln was remembered today in ceremony"],
      },
      "Abraham Lincoln",
    );

    expect(profile?.id).toBe("p_chroniclingamerica_abraham_lincoln");
    expect(profile?.fullName).toBe("Abraham Lincoln");
    expect(profile?.aliases).toContain("1915-02-10");
    expect(profile?.aliases?.[0]).toMatch(/new ulm review/i);
    expect(profile?.confidence).toBe("Low");
    expect(profile?.sourceRecord?.sourceId).toBe("chronicling_america_obituaries");
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedName: "Abraham Lincoln",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "new ulm",
      state: "minnesota",
      kind: "publication context",
    });
  });

  it("falls back to the page title when partof_title is absent", () => {
    const profile = mapChroniclingAmericaItemToProfileInput(
      {
        id: "http://www.loc.gov/resource/sn1/1865-04-15/ed-1/?sp=1",
        title:
          "Image 1 of The Daily Dispatch (Richmond, Va.), April 15, 1865",
        date: "1865-04-15",
        location_state: ["virginia"],
      },
      "John Smith",
    );

    expect(profile?.fullName).toBe("John Smith");
    expect(profile?.aliases?.[0]).toMatch(/daily dispatch/i);
    expect(profile?.locations?.[0]).toMatchObject({
      kind: "publication context",
    });
  });

  it("skips items without a name", () => {
    expect(
      mapChroniclingAmericaItemToProfileInput(
        {
          id: "http://www.loc.gov/resource/x/1900-01-01/ed-1/?sp=1",
          title: "Image 1 of Some Paper",
          date: "1900-01-01",
        },
        "",
      ),
    ).toBeNull();
  });
});
