import { describe, expect, it } from "vitest";
import { mapEuropePmcArticleToProfileInputs } from "@/lib/sources/europe-pmc";

describe("Europe PMC source mapping", () => {
  it("maps matching article authors and strips email-like affiliation text", () => {
    const profiles = mapEuropePmcArticleToProfileInputs("Jane Smith", {
      id: "123",
      source: "MED",
      pmid: "123",
      doi: "10.1/example",
      title: "Example biomedical article",
      pubYear: "2025",
      journalInfo: {
        journal: {
          title: "Example Journal",
        },
      },
      authorList: {
        author: [
          {
            fullName: "Smith J",
            firstName: "Jane",
            lastName: "Smith",
            authorAffiliationDetailsList: {
              authorAffiliation: [
                {
                  affiliation:
                    "Department of Medicine, Example University. jane@example.edu.",
                },
              ],
            },
          },
          {
            fullName: "Jones A",
            firstName: "Alex",
            lastName: "Jones",
          },
        ],
      },
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("Publication: Example biomedical article");
    expect(profiles[0].aliases).toContain("PMID: 123");
    expect(profiles[0].aliases).toContain("DOI: 10.1/example");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "Department of Medicine, Example University.",
      state: "Europe PMC metadata",
      kind: "publication affiliation",
    });
    expect(JSON.stringify(profiles[0])).not.toContain("jane@example.edu");
  });

  it("skips nonmatching authors", () => {
    expect(
      mapEuropePmcArticleToProfileInputs("Jane Smith", {
        id: "999",
        title: "Other article",
        authorList: {
          author: [
            {
              fullName: "Jones A",
              firstName: "Alex",
              lastName: "Jones",
            },
          ],
        },
      }),
    ).toEqual([]);
  });
});
