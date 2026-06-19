import { describe, expect, it } from "vitest";
import { mapInternetArchiveDocToProfileInputs } from "@/lib/sources/internet-archive";

describe("Internet Archive source mapping", () => {
  it("maps matching item creators to archive context profiles", () => {
    const profiles = mapInternetArchiveDocToProfileInputs("Jane Smith", {
      identifier: "example-item",
      title: "Example Item",
      creator: ["Jane Smith", "Alex Jones"],
      year: 2024,
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe("p_ia_jane_smith_example_item_0");
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("Internet Archive item: Example Item");
    expect(profiles[0].aliases).toContain("Archive identifier: example-item");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "Internet Archive",
      state: "Global",
      kind: "archive creator metadata",
    });
  });

  it("skips docs without matching creators", () => {
    expect(
      mapInternetArchiveDocToProfileInputs("Jane Smith", {
        identifier: "example-item",
        creator: ["Alex Jones"],
      }),
    ).toEqual([]);
  });
});

