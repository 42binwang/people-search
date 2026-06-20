import { describe, expect, it } from "vitest";
import { mapPatentToProfileInputs } from "@/lib/sources/uspto-patent";

const patent = {
  patent_number: "10000001",
  patent_title: "Example widget assembly",
  inventors: [
    {
      inventor_first_name: "Jordan",
      inventor_last_name: "Lee",
      inventor_city: "Austin",
      inventor_state: "TX",
    },
    {
      inventor_first_name: "Alex",
      inventor_last_name: "Rivera",
      inventor_city: "Denver",
      inventor_state: "CO",
    },
  ],
  assignees: [{ assignee_organization: "Example Corp" }],
};

describe("USPTO patent inventors source mapping", () => {
  it("maps a matching inventor to a patent-context profile", () => {
    const profiles = mapPatentToProfileInputs("Jordan Lee", patent);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jordan Lee");
    expect(profiles[0].aliases).toContain("Patent: Example widget assembly");
    expect(profiles[0].aliases).toContain("Patent number: 10000001");
    expect(profiles[0].aliases).toContain("Assignee: Example Corp");
    expect(profiles[0].aliases).toContain("Inventor location: Austin, TX");
    // Imprecise city/state is context, not a residential location.
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "USPTO Patents",
      state: "Global",
      kind: "patent inventor context",
    });
    expect(profiles[0].contacts).toEqual([]);
  });

  it("skips inventors that do not match the query", () => {
    expect(mapPatentToProfileInputs("Nobody Match", patent)).toEqual([]);
  });

  it("returns nothing for patents without a number", () => {
    expect(
      mapPatentToProfileInputs("Jordan Lee", { ...patent, patent_number: undefined }),
    ).toEqual([]);
  });
});
