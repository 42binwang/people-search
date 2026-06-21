import { describe, expect, it } from "vitest";
import { normalizeProfileRecords } from "@/lib/profile-source-records";
import type { ProfileSourceRecord } from "@/lib/db";

function record(
  sourceId: string,
  sourceName: string,
  raw: unknown,
): ProfileSourceRecord {
  return {
    sourceId,
    sourceName,
    category: "",
    rawJson: JSON.stringify(raw),
  };
}

describe("normalizeProfileRecords", () => {
  it("groups arXiv, Crossref, and Internet Archive into one deduped work", () => {
    const { works, profiles } = normalizeProfileRecords([
      record(
        "arxiv_api",
        "arXiv API",
        {
          entry: {
            id: "http://arxiv.org/abs/1102.4135v1",
            title: "Location Cheating: A Security Challenge to Location-based Social Network Services",
            published: "2011-02-21T05:17:11Z",
          },
        },
      ),
      record(
        "crossref_works",
        "Crossref Works API",
        {
          work: {
            title: ["Location Cheating: A Security Challenge to Location-Based Social Network Services"],
            DOI: "10.1109/icdcs.2011.42",
            publisher: "IEEE",
            "container-title": ["2011 31st International Conference on Distributed Computing Systems"],
            "published-print": { "date-parts": [[2011, 6]] },
          },
        },
      ),
      record(
        "internet_archive_advanced_search",
        "Internet Archive Advanced Search API",
        {
          doc: {
            identifier: "arxiv-1102.4135",
            title: "Location Cheating: A Security Challenge to Location-based Social Network Services",
            year: 2011,
          },
        },
      ),
    ]);

    expect(works).toHaveLength(1);
    expect(works[0].title).toBe(
      "Location Cheating: A Security Challenge to Location-based Social Network Services",
    );
    expect(works[0].url).toBe("http://arxiv.org/abs/1102.4135v1");
    expect(works[0].detail).toContain("2011");
    expect(works[0].sources).toEqual(
      expect.arrayContaining(["arXiv", "Crossref", "Internet Archive"]),
    );
    expect(profiles).toHaveLength(0);
  });

  it("extracts GitHub, OpenAlex, and Semantic Scholar as profiles", () => {
    const { profiles, works } = normalizeProfileRecords([
      record("github_users", "GitHub REST API User Search", {
        login: "mairen",
        name: "Mai Ren",
        html_url: "https://github.com/mairen",
        location: "Mountain View, CA",
      }),
      record("openalex_authors", "OpenAlex Authors API", {
        id: "https://openalex.org/A5060224723",
        display_name: "Mai Ren",
        works_count: 2,
        cited_by_count: 122,
      }),
      record("semantic_scholar_authors", "Semantic Scholar Author Search", {
        name: "Mai Ren",
        url: "https://www.semanticscholar.org/author/2289968319",
        paperCount: 1,
        hIndex: 1,
      }),
    ]);

    expect(works).toHaveLength(0);
    expect(profiles).toHaveLength(3);
    const github = profiles.find((p) => p.label.includes("@mairen"));
    expect(github?.url).toBe("https://github.com/mairen");
    expect(github?.detail).toContain("Mountain View");
    const openalex = profiles.find((p) => p.label === "Mai Ren" && p.detail.includes("OpenAlex"));
    expect(openalex?.detail).toContain("122 citations");
  });

  it("drops Federal Register and Library of Congress keyword matches", () => {
    const { works, profiles } = normalizeProfileRecords([
      record("federal_register_documents", "FederalRegister.gov Document API", {
        title: "Certain Pillows and Seat Cushions",
        html_url: "https://www.federalregister.gov/documents/2022/19658",
      }),
      record("library_of_congress_search", "Library of Congress Linked Data Search", {
        title: "Mai, Jia, 1964-. Ren jian xin",
      }),
    ]);

    expect(works).toHaveLength(0);
    expect(profiles).toHaveLength(0);
  });

  it("skips malformed raw JSON without throwing", () => {
    const { works, profiles } = normalizeProfileRecords([
      { sourceId: "arxiv_api", sourceName: "arXiv API", category: "", rawJson: "{not json" },
    ]);

    expect(works).toHaveLength(0);
    expect(profiles).toHaveLength(0);
  });

  it("falls back to generic extraction for unknown work sources with title + link", () => {
    const { works } = normalizeProfileRecords([
      record("some_future_source", "Future Source", {
        title: "A future publication",
        url: "https://example.org/future",
      }),
    ]);

    expect(works).toHaveLength(1);
    expect(works[0].title).toBe("A future publication");
    expect(works[0].url).toBe("https://example.org/future");
  });

  it("builds an ORCID profile link from the ORCID iD", () => {
    const { profiles } = normalizeProfileRecords([
      record("orcid_public_registry", "ORCID Public Registry API", {
        "orcid-id": "0000-0002-1825-0097",
        "given-names": "Josiah",
        "family-names": "Carberry",
      }),
    ]);

    const orcid = profiles.find(
      (p) => p.url === "https://orcid.org/0000-0002-1825-0097",
    );
    expect(orcid).toBeDefined();
    expect(orcid?.label).toBe("Josiah Carberry");
    expect(orcid?.detail).toBe("ORCID");
  });

  it("surfaces self-declared LinkedIn and social URLs as outbound profiles", () => {
    const { profiles } = normalizeProfileRecords([
      record("orcid_public_registry", "ORCID Public Registry API", {
        "orcid-id": "0000-0002-1825-0097",
        "given-names": "Josiah",
        "family-names": "Carberry",
        "researcher-urls": {
          "researcher-url": [
            {
              "url-name": "LinkedIn",
              url: { value: "https://www.linkedin.com/in/josiahcarberry" },
            },
            { "url-name": "Twitter", url: { value: "https://twitter.com/jcarberry" } },
          ],
        },
      }),
    ]);

    const linkedin = profiles.find((p) => p.label === "LinkedIn");
    expect(linkedin?.url).toBe("https://www.linkedin.com/in/josiahcarberry");

    const twitter = profiles.find((p) => p.label === "X (Twitter)");
    expect(twitter?.url).toBe("https://twitter.com/jcarberry");

    const orcid = profiles.find(
      (p) => p.url === "https://orcid.org/0000-0002-1825-0097",
    );
    expect(orcid).toBeDefined();
  });

  it("never infers a LinkedIn URL when none is present in the raw data", () => {
    const { profiles } = normalizeProfileRecords([
      record("openalex_authors", "OpenAlex Authors API", {
        id: "https://openalex.org/A5060224723",
        display_name: "Jane Smith",
        works_count: 1,
        cited_by_count: 0,
      }),
    ]);

    expect(profiles.some((p) => p.label === "LinkedIn")).toBe(false);
  });

  it("does not treat a GitHub repository URL as a profile link", () => {
    const { profiles } = normalizeProfileRecords([
      record("arxiv_api", "arXiv API", {
        entry: {
          title: "Some paper",
          id: "http://arxiv.org/abs/1234.5678",
          author: { name: "Jane Smith" },
          comment: "Code: https://github.com/janedoe/awesome-repo",
        },
      }),
    ]);

    // GitHub repo URLs must not be surfaced as a profile (repo vs. profile is
    // ambiguous), so no profile link is added from this work record.
    expect(profiles).toHaveLength(0);
  });
});
