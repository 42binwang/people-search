import { describe, expect, it } from "vitest";
import { mapDataCiteDoiToProfileInputs } from "@/lib/sources/datacite";

describe("DataCite source mapping", () => {
  it("maps matching DOI creators to research context profiles", () => {
    const profiles = mapDataCiteDoiToProfileInputs("Jane Smith", {
      attributes: {
        doi: "10.1234/example-dataset",
        titles: [{ title: "Example Dataset" }],
        publisher: "Example Repository",
        publicationYear: 2025,
        creators: [
          {
            givenName: "Jane",
            familyName: "Smith",
            affiliation: [{ name: "Example Institute" }],
          },
          {
            givenName: "Alex",
            familyName: "Jones",
          },
        ],
      },
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("Research output: Example Dataset");
    expect(profiles[0].aliases).toContain("DOI: 10.1234/example-dataset");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "Example Institute",
      state: "Global",
      kind: "research affiliation",
    });
  });

  it("skips DOI records without matching creators", () => {
    expect(
      mapDataCiteDoiToProfileInputs("Jane Smith", {
        attributes: {
          doi: "10.1234/example",
          creators: [{ givenName: "Alex", familyName: "Jones" }],
        },
      }),
    ).toEqual([]);
  });
});

