import { describe, expect, it } from "vitest";
import {
  mapPubMedArticleToProfileInputs,
  parsePubMedAuthorEmailsFromXml,
} from "@/lib/sources/pubmed";

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

  it("captures a structured corresponding-author email for the matched author", () => {
    const authorEmails = new Map([["jane smith", "jane.smith@university.edu"]]);
    const profiles = mapPubMedArticleToProfileInputs(
      "Jane Smith",
      {
        uid: "111",
        title: "Correspondence article",
        authors: [{ name: "Jane Smith" }],
      },
      authorEmails,
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0].contacts).toEqual([
      {
        type: "email",
        value: "jane.smith@university.edu",
        confidence: "Low",
        sourceId: "ncbi_pubmed",
      },
    ]);
  });

  it("omits contacts when no structured email is available", () => {
    const profiles = mapPubMedArticleToProfileInputs("Jane Smith", {
      uid: "222",
      authors: [{ name: "Jane Smith" }],
    });

    expect(profiles[0].contacts).toEqual([]);
  });

  it("extracts only the structured Email element and ignores affiliation-text emails", () => {
    const xml = `
      <PubmedArticleSet>
        <PubmedArticle>
          <MedlineCitation>
            <PMID Version="1">333</PMID>
            <Article>
              <AuthorList>
                <Author>
                  <LastName>Smith</LastName>
                  <ForeName>Jane</ForeName>
                  <AffiliationInfo><Affiliation>Dept of Biology, University X. affiliation@text.example</Affiliation></AffiliationInfo>
                  <Email>jane.smith@university.edu</Email>
                </Author>
                <Author>
                  <LastName>Jones</LastName>
                  <ForeName>Alex</ForeName>
                  <AffiliationInfo><Affiliation>Dept of Chemistry, hidden@text.example</Affiliation></AffiliationInfo>
                </Author>
              </AuthorList>
            </Article>
          </MedlineCitation>
        </PubmedArticle>
      </PubmedArticleSet>
    `;
    const byPmid = parsePubMedAuthorEmailsFromXml(xml);

    expect(byPmid.get("333")?.get("jane smith")).toBe(
      "jane.smith@university.edu",
    );
    // Alex Jones has only an affiliation-text email (no <Email>), so it is not captured.
    expect(byPmid.get("333")?.has("alex jones")).toBe(false);
  });
});

