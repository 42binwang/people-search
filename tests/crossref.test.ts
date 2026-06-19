import { describe, expect, it } from "vitest";
import { mapCrossrefWorkToProfileInputs } from "@/lib/sources/crossref";

describe("Crossref source mapping", () => {
  it("maps matching work authors to scholarly mention profiles", () => {
    const profiles = mapCrossrefWorkToProfileInputs("Jane Smith", {
      DOI: "10.1234/example",
      title: ["A useful article"],
      "container-title": ["Journal of Examples"],
      issued: {
        "date-parts": [[2024, 1, 1]],
      },
      author: [
        {
          given: "Jane",
          family: "Smith",
          affiliation: [{ name: "Example University" }],
        },
        {
          given: "Alex",
          family: "Jones",
        },
      ],
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("Publication: A useful article");
    expect(profiles[0].aliases).toContain("DOI: 10.1234/example");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "Example University",
      state: "Global",
      kind: "scholarly affiliation",
    });
  });

  it("skips works without a matching author", () => {
    expect(
      mapCrossrefWorkToProfileInputs("Jane Smith", {
        DOI: "10.1234/example",
        author: [{ given: "Alex", family: "Jones" }],
      }),
    ).toEqual([]);
  });
});

