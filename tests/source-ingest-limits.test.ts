import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import { ingestFecCandidates } from "@/lib/sources/fec";
import { ingestFederalRegisterMentions } from "@/lib/sources/federal-register";
import { ingestOpenAlexAuthors } from "@/lib/sources/openalex";
import { ingestWikidataEntities } from "@/lib/sources/wikidata";
import { ingestCrossrefWorks } from "@/lib/sources/crossref";
import { ingestClinicalTrialsPersonnel } from "@/lib/sources/clinical-trials";
import { ingestDataCiteCreators } from "@/lib/sources/datacite";
import { ingestPubMedAuthors } from "@/lib/sources/pubmed";
import { ingestInternetArchiveCreators } from "@/lib/sources/internet-archive";
import { ingestArxivAuthors } from "@/lib/sources/arxiv";
import { ingestOpenLibraryAuthors } from "@/lib/sources/open-library";
import { ingestLibraryOfCongressSearch } from "@/lib/sources/library-of-congress";
import { ingestGitHubUsers } from "@/lib/sources/github";
import { ingestStackExchangeUsers } from "@/lib/sources/stack-exchange";
import { ingestViafAuthorityRecords } from "@/lib/sources/viaf";
import { ingestMusicBrainzArtists } from "@/lib/sources/musicbrainz";
import { ingestOrcidPublicRecords } from "@/lib/sources/orcid";
import { ingestSemanticScholarAuthors } from "@/lib/sources/semantic-scholar";
import { ingestGoogleBooksAuthors } from "@/lib/sources/google-books";
import { ingestEuropePmcAuthors } from "@/lib/sources/europe-pmc";

describe("source ingest limits", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.unstubAllGlobals();
  });

  it("does not add a source-side result cap when no limit is supplied", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        results: [
          { candidate_id: "H1", name: "SMITH, JANE" },
          { candidate_id: "H2", name: "SMITH, JOHN" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ingestFecCandidates({
      query: "Smith",
      apiKey: "TEST",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.has("per_page")).toBe(false);
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(2);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(2);
  });

  it("caps FEC imports locally even if fetch returns more rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({
        results: [
          { candidate_id: "H1", name: "SMITH, JANE" },
          { candidate_id: "H2", name: "SMITH, JOHN" },
        ],
      })),
    );

    const result = await ingestFecCandidates({
      query: "Smith",
      limit: 1,
      apiKey: "TEST",
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Federal Register imports locally even if the API returns a default page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({
        results: [
          { document_number: "2026-1", title: "Jane Smith Notice" },
          { document_number: "2026-2", title: "Another Jane Smith Notice" },
        ],
      })),
    );

    const result = await ingestFederalRegisterMentions({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps OpenAlex imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            { id: "https://openalex.org/A1", display_name: "Jane Smith" },
            { id: "https://openalex.org/A2", display_name: "John Smith" },
          ],
        }),
      ),
    );

    const result = await ingestOpenAlexAuthors({
      query: "Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Wikidata imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          search: [
            { id: "Q1", label: "Jane Smith" },
            { id: "Q2", label: "John Smith" },
          ],
        }),
      ),
    );

    const result = await ingestWikidataEntities({
      query: "Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Crossref work imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          message: {
            items: [
              {
                DOI: "10.1/a",
                author: [{ given: "Jane", family: "Smith" }],
              },
              {
                DOI: "10.1/b",
                author: [{ given: "Jane", family: "Smith" }],
              },
            ],
          },
        }),
      ),
    );

    const result = await ingestCrossrefWorks({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps ClinicalTrials.gov study imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          studies: [
            clinicalTrialStudy("NCT1", "Jane Smith"),
            clinicalTrialStudy("NCT2", "Jane Smith"),
          ],
        }),
      ),
    );

    const result = await ingestClinicalTrialsPersonnel({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps DataCite DOI imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: [
            dataCiteDoi("10.1/a", "Jane", "Smith"),
            dataCiteDoi("10.1/b", "Jane", "Smith"),
          ],
        }),
      ),
    );

    const result = await ingestDataCiteCreators({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps PubMed article imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            esearchresult: {
              idlist: ["1", "2"],
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            result: {
              uids: ["1"],
              "1": {
                uid: "1",
                title: "Example article",
                authors: [{ name: "Jane Smith" }],
              },
            },
          }),
        ),
    );

    const result = await ingestPubMedAuthors({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Internet Archive item imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          response: {
            docs: [
              { identifier: "a", creator: ["Jane Smith"] },
              { identifier: "b", creator: ["Jane Smith"] },
            ],
          },
        }),
      ),
    );

    const result = await ingestInternetArchiveCreators({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps arXiv entry imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        textResponse(`
          <feed xmlns="http://www.w3.org/2005/Atom">
            <entry>
              <id>http://arxiv.org/abs/1</id>
              <title>First</title>
              <published>2024-01-01T00:00:00Z</published>
              <author><name>Jane Smith</name></author>
            </entry>
            <entry>
              <id>http://arxiv.org/abs/2</id>
              <title>Second</title>
              <published>2024-01-02T00:00:00Z</published>
              <author><name>Jane Smith</name></author>
            </entry>
          </feed>
        `),
      ),
    );

    const result = await ingestArxivAuthors({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Open Library author imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          docs: [
            { key: "OL1A", name: "Jane Smith" },
            { key: "OL2A", name: "Jane Smith" },
          ],
        }),
      ),
    );

    const result = await ingestOpenLibraryAuthors({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Library of Congress imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          "atom:feed",
          {},
          locEntry("1", "Smith, Jane. First"),
          locEntry("2", "Smith, Jane. Second"),
        ]),
      ),
    );

    const result = await ingestLibraryOfCongressSearch({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps GitHub user imports locally and hydrates only capped users", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            items: [
              { login: "janesmith" },
              { login: "janesmith2" },
            ],
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            login: "janesmith",
            name: "Jane Smith",
          }),
        ),
    );

    const result = await ingestGitHubUsers({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caps Stack Exchange user imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          items: [
            { user_id: 1, display_name: "Jane Smith" },
            { user_id: 2, display_name: "Jane Smith" },
          ],
        }),
      ),
    );

    const result = await ingestStackExchangeUsers({
      query: "Jane Smith",
      site: "stackoverflow",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps VIAF authority imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          searchRetrieveResponse: {
            records: {
              record: [
                viafRecord("1", "Twain, Mark, 1835-1910"),
                viafRecord("2", "Twain, Mark, 1835-1910"),
              ],
            },
          },
        }),
      ),
    );

    const result = await ingestViafAuthorityRecords({
      query: "Mark Twain",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps MusicBrainz artist imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          artists: [
            { id: "artist-1", name: "Taylor Swift" },
            { id: "artist-2", name: "Taylor Swift" },
          ],
        }),
      ),
    );

    const result = await ingestMusicBrainzArtists({
      query: "Taylor Swift",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps ORCID public record imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          "expanded-result": [
            { "orcid-id": "0000-0001", "credit-name": "Jane Smith" },
            { "orcid-id": "0000-0002", "credit-name": "Jane Smith" },
          ],
        }),
      ),
    );

    const result = await ingestOrcidPublicRecords({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Semantic Scholar author imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: [
            { authorId: "1", name: "Jane Smith" },
            { authorId: "2", name: "Jane Smith" },
          ],
        }),
      ),
    );

    const result = await ingestSemanticScholarAuthors({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("caps Google Books volume imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          items: [
            googleBookVolume("book-1", "Jane Smith"),
            googleBookVolume("book-2", "Jane Smith"),
          ],
        }),
      ),
    );

    const result = await ingestGoogleBooksAuthors({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("does not add Google Books maxResults when no limit is supplied", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          googleBookVolume("book-1", "Jane Smith"),
          googleBookVolume("book-2", "Jane Smith"),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ingestGoogleBooksAuthors({
      query: "Jane Smith",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.has("maxResults")).toBe(false);
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(2);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(2);
  });

  it("caps Europe PMC article imports locally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          resultList: {
            result: [
              europePmcArticle("1", "Jane", "Smith"),
              europePmcArticle("2", "Jane", "Smith"),
            ],
          },
        }),
      ),
    );

    const result = await ingestEuropePmcAuthors({
      query: "Jane Smith",
      limit: 1,
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

function textResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/xml",
    },
  });
}

function clinicalTrialStudy(nctId: string, name: string) {
  return {
    protocolSection: {
      identificationModule: {
        nctId,
        briefTitle: "Example Trial",
      },
      contactsLocationsModule: {
        overallOfficials: [
          {
            name,
            role: "PRINCIPAL_INVESTIGATOR",
          },
        ],
      },
    },
  };
}

function dataCiteDoi(doi: string, givenName: string, familyName: string) {
  return {
    attributes: {
      doi,
      creators: [
        {
          givenName,
          familyName,
        },
      ],
    },
  };
}

function locEntry(id: string, title: string) {
  return [
    "atom:entry",
    {},
    ["atom:title", {}, title],
    ["atom:id", {}, `info:lc/resources/works/${id}`],
  ];
}

function viafRecord(viafId: string, heading: string) {
  return {
    recordData: {
      "ns2:VIAFCluster": {
        "ns2:viafID": viafId,
        "ns2:mainHeadings": {
          "ns2:data": {
            "ns2:text": heading,
          },
        },
      },
    },
  };
}

function googleBookVolume(id: string, author: string) {
  return {
    id,
    volumeInfo: {
      title: "Example Book",
      authors: [author],
    },
  };
}

function europePmcArticle(id: string, firstName: string, lastName: string) {
  return {
    id,
    title: "Example article",
    authorList: {
      author: [
        {
          firstName,
          lastName,
        },
      ],
    },
  };
}
