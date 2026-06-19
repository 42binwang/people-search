import { describe, expect, it } from "vitest";
import { mapPubMedArticleToProfileInputs } from "@/lib/sources/pubmed";

describe("PubMed source mapping", () => {
  it("maps matching full author names to biomedical literature context profiles", () => {
    const profiles = mapPubMedArticleToProfileInputs("Jane Smith", {
      uid: "123456",
      title: "Example biomedical article",
      pubdate: "2026 Jan",
      fulljournalname: "Journal of Examples",
      authors: [{ name: "Jane Smith" }, { name: "Alex Jones" }],
      articleids: [{ idtype: "doi", value: "10.1234/pubmed-example" }],
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe("p_pubmed_jane_smith_123456_0");
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("PubMed article: Example biomedical article");
    expect(profiles[0].aliases).toContain("PMID: 123456");
    expect(profiles[0].aliases).toContain("DOI: 10.1234/pubmed-example");
  });

  it("matches abbreviated PubMed author initials when family name matches", () => {
    const profiles = mapPubMedArticleToProfileInputs("Jane Smith", {
      uid: "654321",
      title: "Example abbreviated article",
      authors: [{ name: "Smith J" }],
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Smith J");
  });

  it("skips articles without matching authors", () => {
    expect(
      mapPubMedArticleToProfileInputs("Jane Smith", {
        uid: "999",
        authors: [{ name: "Alex Jones" }],
      }),
    ).toEqual([]);
  });
});

