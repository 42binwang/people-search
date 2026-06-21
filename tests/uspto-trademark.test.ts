import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestUsptoTrademarkOwners,
  mapUsptoTrademarkToProfileInput,
  type UsptoTrademarkRecord,
} from "@/lib/sources/uspto-trademark";

const ORIGINAL_ENV = { ...process.env };

const baseRecord: UsptoTrademarkRecord = {
  ownerName: "Maria Elena Castillo",
  ownerAddress1: "1420 Oakwood Ave",
  ownerCity: "Austin",
  ownerState: "TX",
  ownerPostalCode: "78704",
  ownerCountry: "USA",
  markDescription: "CASTILLO CRAFT COFFEE",
  registrationNumber: "6123456",
  serialNumber: "90123456",
  status: "Registered",
  filingDate: "2020-03-14",
};

describe("USPTO trademark owners source mapping", () => {
  it("maps a matching individual owner to a trademark-context profile", () => {
    const profile = mapUsptoTrademarkToProfileInput(
      "Maria Castillo",
      baseRecord,
    );

    expect(profile?.id).toBe("p_uspto_trademark_maria_elena_castillo_6123456");
    expect(profile?.fullName).toBe("Maria Elena Castillo");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Low");
    expect(profile?.aliases).toContain("Trademark: CASTILLO CRAFT COFFEE");
    expect(profile?.aliases).toContain("Registration number: 6123456");
    expect(profile?.aliases).toContain("Serial number: 90123456");
    expect(profile?.aliases).toContain("Status: Registered");
    expect(profile?.aliases).toContain("Filing date: 2020-03-14");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "1420 Oakwood Ave",
      city: "Austin",
      state: "TX",
      zip: "78704",
      kind: "trademark owner/correspondence address",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "uspto_trademark_owners",
      sourceRecordId: "6123456",
    });
    expect(profile?.sourceRecord?.raw).toEqual(baseRecord);
  });

  it("falls back to serial number when registration number is absent", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ...baseRecord,
      registrationNumber: undefined,
    });

    expect(profile?.id).toBe(
      "p_uspto_trademark_maria_elena_castillo_90123456",
    );
    expect(profile?.sourceRecord?.sourceRecordId).toBe("90123456");
  });

  it("falls back to USPTO/US when address city/state are missing", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ...baseRecord,
      ownerCity: undefined,
      ownerState: undefined,
    });

    expect(profile?.locations?.[0]).toMatchObject({
      city: "USPTO",
      state: "US",
    });
  });

  it("collapses internal whitespace in the owner name", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ...baseRecord,
      ownerName: "  Maria   Elena   Castillo  ",
    });

    expect(profile?.fullName).toBe("Maria Elena Castillo");
  });

  it("omits alias entries for missing optional fields", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ownerName: "Maria Elena Castillo",
      registrationNumber: "6123456",
    });

    expect(profile?.aliases).toEqual(["Registration number: 6123456"]);
  });

  it("filters to the queried name", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", baseRecord),
    ).not.toBeNull();
    expect(
      mapUsptoTrademarkToProfileInput("Nobody Match", baseRecord),
    ).toBeNull();
  });

  it("requires every query token to appear in the owner name", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", baseRecord),
    ).not.toBeNull();
    expect(
      mapUsptoTrademarkToProfileInput("Maria Hernandez", baseRecord),
    ).toBeNull();
  });

  it("skips records with a blank owner name", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", {
        ...baseRecord,
        ownerName: "   ",
      }),
    ).toBeNull();
  });

  it("skips records with no identifying number", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", {
        ...baseRecord,
        registrationNumber: undefined,
        serialNumber: undefined,
      }),
    ).toBeNull();
  });

  it("skips records with no owner name at all", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", {
        ownerAddress1: "1420 Oakwood Ave",
        ownerCity: "Austin",
        registrationNumber: "6123456",
      }),
    ).toBeNull();
  });
});

const matchingRecord: UsptoTrademarkRecord = {
  ownerName: "Jane Allison Smith",
  ownerAddress1: "500 Summit Blvd",
  ownerCity: "Denver",
  ownerState: "CO",
  ownerPostalCode: "80203",
  ownerCountry: "USA",
  markDescription: "SMITH BOTANICALS",
  registrationNumber: "7012345",
  serialNumber: "97123456",
  status: "Registered",
  filingDate: "2021-07-22",
};

function buildPayload(records: UsptoTrademarkRecord[]) {
  // Realistic ODP-style wrapper shape; extractTrademarkRecords also accepts a
  // bare array, but the wrapped `items` form mirrors the live endpoint.
  return {
    totalHits: records.length,
    items: records,
  };
}

describe("USPTO trademark ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.USPTO_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("fetches, maps, and upserts matching owner records with an explicit apiKey", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => buildPayload([matchingRecord]),
      } as any);

    const result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "https://api.uspto.gov/api/v1/trademark/search",
    );
    expect(String(url)).toContain("api_key=test-key");
    expect(String(url)).toContain("searchType=owner");
    expect(String(url)).toContain("query=Jane+Smith");
    expect(init).toMatchObject({
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchUsptoTrademarkIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);

    const upserted = upsertProfile.mock.calls[0][0];
    expect(upserted.id).toBe("p_uspto_trademark_jane_allison_smith_7012345");
    expect(upserted.fullName).toBe("Jane Allison Smith");
    expect(upserted.locations?.[0]).toMatchObject({
      city: "Denver",
      state: "CO",
      zip: "80203",
      kind: "trademark owner/correspondence address",
    });
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "uspto_trademark_owners" }),
    );
  });

  it("falls back to USPTO_API_KEY env var when no apiKey is passed", async () => {
    process.env.USPTO_API_KEY = "env-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => buildPayload([matchingRecord]),
      } as any);

    const result = await ingestUsptoTrademarkOwners({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api_key=env-key");
    expect(result.imported).toBe(1);
  });

  it("returns zero results without fetching when no key is available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await ingestUsptoTrademarkOwners({ query: "Jane Smith" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      fetched: 0,
      imported: 0,
      url: "https://api.uspto.gov/api/v1/trademark/search",
    });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the USPTO request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as any);

    await expect(
      ingestUsptoTrademarkOwners({ query: "Jane Smith", apiKey: "test-key" }),
    ).rejects.toThrow(/USPTO trademark request failed: 503/);

    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("counts only name-matching records toward imported", async () => {
    const records: UsptoTrademarkRecord[] = [
      matchingRecord,
      {
        ownerName: "Acme Holdings LLC",
        ownerAddress1: "1 Corporate Pl",
        ownerCity: "Wilmington",
        ownerState: "DE",
        registrationNumber: "7099999",
      },
      {
        ownerName: "Robert Jones",
        ownerAddress1: "9 Pine St",
        ownerCity: "Boston",
        ownerState: "MA",
        registrationNumber: "7088888",
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildPayload(records),
    } as any);

    const result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(result.fetched).toBe(3);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(upsertProfile.mock.calls[0][0].fullName).toBe("Jane Allison Smith");
  });

  it("respects the requested limit when clamping records", async () => {
    const records: UsptoTrademarkRecord[] = Array.from({ length: 4 }, (_, i) => ({
      ...matchingRecord,
      registrationNumber: String(7012345 + i),
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildPayload(records),
    } as any);

    const result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
      limit: 2,
    });

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(2);
    expect(upsertProfile).toHaveBeenCalledTimes(2);
  });

  it("handles an empty result set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildPayload([]),
    } as any);

    const result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("accepts a bare array payload and results/trademarks wrapper keys", async () => {
    // Bare array (extractTrademarkRecords Array.isArray branch)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [matchingRecord],
    } as any);
    let result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
    });
    expect(result.imported).toBe(1);

    // `results` wrapper key
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [matchingRecord] }),
    } as any);
    result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
    });
    expect(result.imported).toBe(1);

    // `trademarks` wrapper key (line 149 fallback)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ trademarks: [matchingRecord] }),
    } as any);
    result = await ingestUsptoTrademarkOwners({
      query: "Jane Smith",
      apiKey: "test-key",
    });
    expect(result.imported).toBe(1);
  });
});
