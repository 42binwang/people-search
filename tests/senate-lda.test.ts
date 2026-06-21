import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestSenateLdaLobbying,
  mapSenateLdaLobbyistToProfileInput,
  type LdaFiling,
} from "@/lib/sources/senate-lda";

const baseFiling: LdaFiling = {
  filing_uuid: "1cc64ccc-35a7-4972-b9e6-09db00289a7a",
  filing_year: 1999,
  client: { name: "FIDELITY INVESTMENTS", state: "MA", country: "US" },
  registrant: { name: "WILLIAMS AND JENSEN, PLLC", state: "DC" },
  lobbying_activities: [],
};

describe("Senate LDA source mapping", () => {
  it("maps a filing lobbyist to a context profile", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Mary Lynne Whalen",
      registrantName: "WILLIAMS AND JENSEN, PLLC",
      clientName: "FIDELITY INVESTMENTS",
      year: 1999,
      filing: baseFiling,
    });

    expect(profile?.id).toBe("p_lda_mary_lynne_whalen");
    expect(profile?.fullName).toBe("Mary Lynne Whalen");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain(
      "Last known institution: WILLIAMS AND JENSEN, PLLC",
    );
    expect(profile?.aliases).toContain("Lobbying client: FIDELITY INVESTMENTS");
    expect(profile?.aliases).toContain("Year: 1999");
    expect(profile?.sourceRecord?.sourceId).toBe("senate_lda_lobbying");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "1cc64ccc-35a7-4972-b9e6-09db00289a7a__mary_lynne_whalen",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedLobbyist: "Mary Lynne Whalen",
      filing: baseFiling,
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "WILLIAMS AND JENSEN, PLLC",
      state: "US",
      kind: "lobbying filing affiliation",
    });
  });

  it("omits locations and all aliases when registrant/client/year are missing", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Marcus Reid",
      filing: { filing_uuid: "no-affil", filing_year: 2022 },
    });

    expect(profile).not.toBeNull();
    expect(profile?.aliases).toEqual([]);
    expect(profile?.locations).toEqual([]);
    expect(profile?.id).toBe("p_lda_marcus_reid");
  });

  it("includes only the matching aliases when client/year present but no registrant", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Jane Doe",
      clientName: "Lockheed Martin",
      year: 2021,
      filing: { filing_uuid: "partial" },
    });

    expect(profile?.aliases).toEqual([
      "Lobbying client: Lockheed Martin",
      "Year: 2021",
    ]);
    // No registrant means no affiliation location.
    expect(profile?.locations).toEqual([]);
  });

  it("normalizes a name with punctuation and surrounding whitespace into a stable id", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: " O'Brien,  Mary-Jane !! ",
      registrantName: "Brownstein Hyatt",
      filing: { filing_uuid: "punct" },
    });

    expect(profile?.id).toBe("p_lda_o_brien_mary_jane");
    // fullName is preserved verbatim.
    expect(profile?.fullName).toBe(" O'Brien,  Mary-Jane !! ");
  });

  it("falls back to 'filing' in sourceRecordId when filing_uuid is absent", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Jane Doe",
      filing: {},
    });

    expect(profile?.sourceRecord?.sourceRecordId).toBe("filing__jane_doe");
  });

  it("returns null for an empty lobbyist name even when other fields are present", () => {
    expect(
      mapSenateLdaLobbyistToProfileInput({
        fullName: "",
        registrantName: "WILLIAMS AND JENSEN, PLLC",
        clientName: "FIDELITY INVESTMENTS",
        year: 1999,
        filing: baseFiling,
      }),
    ).toBeNull();
  });
});

describe("Senate LDA ingest", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("returns zero when no first or last name is supplied without calling fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await ingestSenateLdaLobbying({});

    expect(result).toEqual({
      fetched: 0,
      imported: 0,
      url: "https://lda.senate.gov/api/v1/filings/",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // Still registers the source for the catalog.
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("fetches filings by lobbyist name and imports one profile per matched lobbyist", async () => {
    const filingsPayload = {
      results: [
        {
          filing_uuid: "1cc64ccc-35a7-4972-b9e6-09db00289a7a",
          filing_year: 1999,
          client: { name: "FIDELITY INVESTMENTS", state: "MA", country: "US" },
          registrant: {
            name: "WILLIAMS AND JENSEN, PLLC",
            state: "DC",
          },
          lobbying_activities: [
            {
              lobbyists: [
                {
                  lobbyist: {
                    first_name: "Mary",
                    middle_name: "Lynne",
                    last_name: "Whalen",
                  },
                },
                {
                  // Different lobbyist on the same filing -> a second profile.
                  lobbyist: {
                    first_name: "Jane",
                    last_name: "Smith",
                  },
                },
                {
                  // Non-matching name -> filtered out by required tokens.
                  lobbyist: {
                    first_name: "Alex",
                    last_name: "Jones",
                  },
                },
                {
                  // Missing lobbyist payload -> skipped.
                },
              ],
            },
          ],
        },
      ],
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(filingsPayload), { status: 200 }),
    );

    const result = await ingestSenateLdaLobbying({
      firstName: "Jane",
      lastName: "Smith",
    });

    // Request contract: filings endpoint with lobbyist_name + page_size params.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.hostname).toBe("lda.senate.gov");
    expect(requestedUrl.pathname).toBe("/api/v1/filings/");
    expect(requestedUrl.searchParams.get("lobbyist_name")).toBe("Jane Smith");
    expect(requestedUrl.searchParams.get("page_size")).toBe("50");

    // Jane Smith matches the required tokens; Mary Lynne Whalen does NOT
    // (tokens are derived from "Jane Smith", and the candidate must contain
    // both). So only one profile is imported.
    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    const resultUrl = new URL(result.url);
    expect(resultUrl.hostname).toBe("lda.senate.gov");
    expect(resultUrl.pathname).toBe("/api/v1/filings/");
    expect(resultUrl.searchParams.get("lobbyist_name")).toBe("Jane Smith");
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);

    const profile = dbMocks.upsertProfile.mock.calls[0]?.[0];
    expect(profile).toMatchObject({
      id: "p_lda_jane_smith",
      fullName: "Jane Smith",
      ageRange: "Unknown",
      confidence: "Medium",
    });
    expect(profile.aliases).toContain(
      "Last known institution: WILLIAMS AND JENSEN, PLLC",
    );
    expect(profile.aliases).toContain(
      "Lobbying client: FIDELITY INVESTMENTS",
    );
    expect(profile.aliases).toContain("Year: 1999");
    expect(profile.locations?.[0]).toMatchObject({
      city: "WILLIAMS AND JENSEN, PLLC",
      state: "US",
      kind: "lobbying filing affiliation",
      sourceId: "senate_lda_lobbying",
    });
    expect(profile.contacts).toEqual([]);
    expect(profile.sourceRecord).toMatchObject({
      sourceId: "senate_lda_lobbying",
      sourceRecordId:
        "1cc64ccc-35a7-4972-b9e6-09db00289a7a__jane_smith",
    });
    expect(profile.sourceRecord.raw).toMatchObject({
      matchedLobbyist: "Jane Smith",
    });
  });

  it("dedupes lobbyists that appear across multiple filings into a single profile", async () => {
    const sameLobbyist = {
      lobbyist: { first_name: "Jane", last_name: "Smith" },
    };
    const filingsPayload = {
      results: [
        {
          filing_uuid: "aaa",
          filing_year: 2020,
          client: { name: "Acme" },
          registrant: { name: "Firm One" },
          lobbying_activities: [{ lobbyists: [sameLobbyist] }],
        },
        {
          filing_uuid: "bbb",
          filing_year: 2021,
          client: { name: "Globex" },
          registrant: { name: "Firm Two" },
          lobbying_activities: [{ lobbyists: [sameLobbyist] }],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(filingsPayload), { status: 200 }),
    );

    const result = await ingestSenateLdaLobbying({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result).toEqual({ fetched: 2, imported: 1, url: expect.any(String) });
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
    // First registrant wins for the deduped profile.
    expect(dbMocks.upsertProfile.mock.calls[0]?.[0]?.aliases).toContain(
      "Last known institution: Firm One",
    );
  });

  it("splits a free-form query into first/last and matches lobbyists", async () => {
    const filingsPayload = {
      results: [
        {
          filing_uuid: "q1",
          filing_year: 2022,
          client: { name: "Widget Co" },
          lobbying_activities: [
            {
              lobbyists: [
                { lobbyist: { first_name: "John", last_name: "Quincy" } },
              ],
            },
          ],
        },
      ],
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(filingsPayload), { status: 200 }),
    );

    const result = await ingestSenateLdaLobbying({ query: "John Quincy" });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    // splitQuery() -> tokenizeName() -> normalizeName() lowercases the
    // query-derived name, so the lobbyist_name param is normalized.
    expect(requestedUrl.searchParams.get("lobbyist_name")).toBe("john quincy");
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile.mock.calls[0]?.[0]?.id).toBe(
      "p_lda_john_quincy",
    );
  });

  it("respects the import limit by truncating the filings slice", async () => {
    const filingsPayload = {
      results: [
        {
          filing_uuid: "f1",
          filing_year: 2020,
          lobbying_activities: [
            { lobbyists: [{ lobbyist: { first_name: "Jane", last_name: "Smith" } }] },
          ],
        },
        {
          filing_uuid: "f2",
          filing_year: 2020,
          lobbying_activities: [
            { lobbyists: [{ lobbyist: { first_name: "Jane", last_name: "Smith" } }] },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(filingsPayload), { status: 200 }),
    );

    const result = await ingestSenateLdaLobbying({
      firstName: "Jane",
      lastName: "Smith",
      limit: 1,
    });

    // Only the first filing is considered; the single matching lobbyist
    // dedupes to one profile.
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
  });

  it("imports zero when no lobbyists match the required name tokens", async () => {
    const filingsPayload = {
      results: [
        {
          filing_uuid: "nomatch",
          filing_year: 2020,
          lobbying_activities: [
            {
              lobbyists: [
                { lobbyist: { first_name: "Completely", last_name: "Different" } },
              ],
            },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(filingsPayload), { status: 200 }),
    );

    const result = await ingestSenateLdaLobbying({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result).toMatchObject({ fetched: 1, imported: 0 });
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("imports zero when the API returns an empty results array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );

    const result = await ingestSenateLdaLobbying({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result).toMatchObject({ fetched: 0, imported: 0 });
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the Senate LDA request is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(
      ingestSenateLdaLobbying({ firstName: "Jane", lastName: "Smith" }),
    ).rejects.toThrow(/Senate LDA request failed: 500/);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });
});
