import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestNycAcrisDeeds,
  mapNycAcrisPartyToProfileInput,
  type AcrisLegal,
  type AcrisParty,
} from "@/lib/sources/nyc-acris-deeds";

describe("NYC ACRIS deeds source mapping", () => {
  it("maps a grantor party (LAST, FIRST) to a context profile with party address", () => {
    const party: AcrisParty = {
      document_id: "2008091000033001",
      record_type: "P",
      party_type: "1",
      name: "SMITH, JANE Q",
      address_1: "123 EXAMPLE ST",
      city: "NEW YORK",
      state: "NY",
      zip: "10019",
      country: "US",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Jane Q Smith");

    expect(profile?.id).toBe("p_acris_jane_q_smith");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain("Party role: grantor (seller)");
    expect(profile?.sourceRecord?.sourceId).toBe("nyc_acris_deeds");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "2008091000033001__jane_q_smith",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedParty: "Jane Q Smith",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "NEW YORK",
      state: "NY",
      kind: "property record",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
  });

  it("maps a grantee (buyer) party role", () => {
    const party: AcrisParty = {
      document_id: "2023051500045001",
      party_type: "2",
      name: "RODRIGUEZ, MARIA E",
      city: "BRONX",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Maria E Rodriguez");

    expect(profile?.aliases).toContain("Party role: grantee (buyer)");
    expect(profile?.aliases).not.toContain("Party role: grantor (seller)");
  });

  it("maps a lender (party_type 3) role", () => {
    const party: AcrisParty = {
      document_id: "2024012000122003",
      party_type: "3",
      name: "CHEN, LINDA",
      city: "NEW YORK",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Linda Chen");

    expect(profile?.aliases).toContain("Party role: lender");
  });

  it("uses an unknown party_type code as a fallback alias", () => {
    const party: AcrisParty = {
      document_id: "2024012000122004",
      party_type: "9",
      name: "PUBLIC, SAM",
      city: "QUEENS",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Sam Public");

    expect(profile?.aliases).toContain("Party role code: 9");
  });

  it("omits any role alias when party_type is missing", () => {
    const party: AcrisParty = {
      document_id: "2024012000122005",
      name: "MILLER, FRANK",
      city: "STATEN ISLAND",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Frank Miller");

    expect(profile?.aliases).toEqual([]);
  });

  it("falls back to the recorded property address when the party has no mailing city/state", () => {
    const party: AcrisParty = {
      document_id: "2026040300428001",
      party_type: "2",
      name: "3111 LLC",
    };
    const legal: AcrisLegal = {
      document_id: "2026040300428001",
      borough: "4",
      block: "11653",
      lot: "50",
      street_number: "114-29",
      street_name: "126 STREET",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "3111 LLC", legal);

    expect(profile?.fullName).toBe("3111 LLC");
    expect(profile?.aliases).toContain("Party role: grantee (buyer)");
    expect(profile?.locations).toHaveLength(1);
    expect(profile?.locations?.[0]).toMatchObject({
      city: "New York",
      state: "NY",
      kind: "property record",
    });
  });

  it("defaults the state to NY when only the party city is present", () => {
    const party: AcrisParty = {
      document_id: "2024021200088007",
      party_type: "2",
      name: "KOWALSKI, ANNA",
      city: "ASTORIA",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Anna Kowalski");

    expect(profile?.locations?.[0]).toMatchObject({
      city: "ASTORIA",
      state: "NY",
    });
  });

  it("defaults the city to New York when only the party state is present", () => {
    const party: AcrisParty = {
      document_id: "2024021200088008",
      party_type: "2",
      name: "ROSSI, MARCO",
      state: "NJ",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Marco Rossi");

    expect(profile?.locations?.[0]).toMatchObject({
      city: "New York",
      state: "NJ",
    });
  });

  it("produces no locations when neither a party address nor a legals street exists", () => {
    const party: AcrisParty = {
      document_id: "2024021200088009",
      party_type: "2",
      name: "JONES, CHRIS",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Chris Jones");

    expect(profile).not.toBeNull();
    expect(profile?.locations).toEqual([]);
  });

  it("produces no locations when the legals record has no street components", () => {
    const party: AcrisParty = {
      document_id: "2024021200088010",
      party_type: "2",
      name: "JONES, CHRIS",
    };
    const legal: AcrisLegal = {
      document_id: "2024021200088010",
      borough: "1",
      block: "00100",
      lot: "0050",
      // street_number / street_name / unit all missing
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Chris Jones", legal);

    expect(profile?.locations).toEqual([]);
  });

  it("skips parties without any name", () => {
    expect(
      mapNycAcrisPartyToProfileInput(
        { party_type: "1", name: "" },
        "",
      ),
    ).toBeNull();
  });

  it("uses 'doc' as the document id fallback when document_id is missing", () => {
    const party: AcrisParty = {
      party_type: "2",
      name: "BROWN, LESLIE",
      city: "NEW YORK",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Leslie Brown");

    expect(profile?.sourceRecord?.sourceRecordId).toBe("doc__leslie_brown");
  });

  it("normalizes id and sourceRecordId keys consistently (apostrophes/punctuation)", () => {
    const party: AcrisParty = {
      document_id: "2024030100099001",
      party_type: "2",
      name: "O'NEAL, SHAUN",
      city: "BROOKLYN",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Shaun O'Neal");

    // normalizeKey collapses any run of non-alphanumerics to a single "_",
    // so "O'Neal" -> "o_neal" (the apostrophe becomes one separator).
    expect(profile?.id).toBe("p_acris_shaun_o_neal");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "2024030100099001__shaun_o_neal",
    );
  });
});

describe("NYC ACRIS deeds ingest", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(upsertProfile).mockReset();
    vi.mocked(upsertApprovedSource).mockClear();
  });

  it("fetches parties then legals, maps, and upserts matching profiles", async () => {
    const parties: AcrisParty[] = [
      {
        document_id: "2008091000033001",
        record_type: "P",
        party_type: "1",
        name: "SMITH, JANE Q",
        address_1: "123 EXAMPLE ST",
        city: "NEW YORK",
        state: "NY",
        zip: "10019",
        country: "US",
      },
      // Different surname — should be filtered out by name-token matching.
      {
        document_id: "2010010200055002",
        party_type: "2",
        name: "JOHNSON, ROBERT",
        city: "BROOKLYN",
        state: "NY",
      },
    ];
    const legals: AcrisLegal[] = [
      {
        document_id: "2008091000033001",
        borough: "1",
        block: "01000",
        lot: "0050",
        street_number: "456",
        street_name: "WEST 42 STREET",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => parties,
    } as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => legals,
    } as any);

    const result = await ingestNycAcrisDeeds({
      firstName: "Jane",
      lastName: "Smith",
    });

    // Two HTTP fetches: parties lookup, then the legals document_id IN (...) lookup.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "data.cityofnewyork.us/resource/636b-3b5g.json",
    );
    // URLSearchParams encodes `$` as %24, space as +, comma as %2C.
    expect(fetchMock.mock.calls[0][0]).toContain("%24where=");
    expect(fetchMock.mock.calls[0][0]).toContain("SMITH%2C+JANE");
    expect(fetchMock.mock.calls[1][0]).toContain(
      "data.cityofnewyork.us/resource/8h5j-fqxa.json",
    );
    expect(fetchMock.mock.calls[1][0]).toContain("document_id+in+%28");

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.url).toContain("636b-3b5g.json");

    // The source is registered once at the start of ingest.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertApprovedSource).mock.calls[0][0]).toMatchObject({
      id: "nyc_acris_deeds",
      category: "Real property record mention",
    });

    // Only the name-matching party is upserted; mapping reflects the real
    // adapter contract (alias = party role, location = party mailing address).
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.id).toBe("p_acris_jane_q_smith");
    // The adapter preserves ACRIS's stored casing.
    expect(profile.fullName).toBe("JANE Q SMITH");
    expect(profile.aliases).toContain("Party role: grantor (seller)");
    expect(profile.locations?.[0]).toMatchObject({
      city: "NEW YORK",
      state: "NY",
    });
    expect(profile.sourceRecord?.sourceId).toBe("nyc_acris_deeds");
    expect(profile.sourceRecord?.sourceRecordId).toBe(
      "2008091000033001__jane_q_smith",
    );
  });

  it("skips the legals fetch when parties return no document_ids", async () => {
    const parties: AcrisParty[] = [
      {
        party_type: "2",
        name: "SMITH, JANE",
        city: "NEW YORK",
        state: "NY",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => parties,
    } as any);

    const result = await ingestNycAcrisDeeds({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    // Falls back to "doc" as the document id when document_id is missing.
    expect(vi.mocked(upsertProfile).mock.calls[0][0].sourceRecord
      ?.sourceRecordId).toBe("doc__jane_smith");
  });

  it("returns zero imported when the parties request fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => [],
    } as any);

    await expect(
      ingestNycAcrisDeeds({ firstName: "Jane", lastName: "Smith" }),
    ).rejects.toThrow(/NYC ACRIS request failed: 500/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("tolerates a legals fetch failure by still importing matched parties", async () => {
    const parties: AcrisParty[] = [
      {
        document_id: "2024012000122003",
        party_type: "3",
        name: "SMITH, JANE",
        city: "NEW YORK",
        state: "NY",
      },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => parties,
    } as any);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => [],
    } as any);

    const result = await ingestNycAcrisDeeds({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    // The party still has a mailing address, so it imports without the legal.
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    // The adapter preserves the stored casing (ACRIS is uppercase).
    expect(profile.fullName).toBe("JANE SMITH");
    expect(profile.aliases).toContain("Party role: lender");
  });

  it("returns fetched 0 without any fetch when no name is provided", async () => {
    const result = await ingestNycAcrisDeeds({});

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertProfile).not.toHaveBeenCalled();
    // Source registration still happens up front.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
  });

  it("parses a free-form query into LAST, FIRST and queries ACRIS", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [] as AcrisParty[],
    } as any);

    const result = await ingestNycAcrisDeeds({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // splitQuery treats the first token as given, rest as surname ->
    // "SMITH, JANE" prefix pattern.
    expect(fetchMock.mock.calls[0][0]).toContain("SMITH%2C+JANE");
    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
  });
});
