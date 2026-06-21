import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertProfile } from "@/lib/db";
import {
  ingestViafAuthorityRecords,
  mapViafRecordToProfileInput,
  parseViafRecords,
} from "@/lib/sources/viaf";

describe("VIAF source mapping", () => {
  it("parses collapsed VIAF search records and maps matching headings", () => {
    const records = parseViafRecords({
      searchRetrieveResponse: {
        records: {
          record: viafRecord("12345", "Twain, Mark, 1835-1910"),
        },
      },
    });

    expect(records).toHaveLength(1);

    const profile = mapViafRecordToProfileInput("Mark Twain", records[0]);
    expect(profile?.id).toBe("p_viaf_12345");
    expect(profile?.fullName).toBe("Twain, Mark, 1835-1910");
    expect(profile?.aliases).toContain("VIAF ID: 12345");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.aliases).toContain("Birth date metadata: 1835");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "VIAF",
      state: "Global",
      kind: "library authority metadata",
    });
  });

  it("skips nonmatching VIAF headings", () => {
    expect(
      mapViafRecordToProfileInput(
        "Jane Smith",
        viafRecord("999", "Jones, Alex, 1970-"),
      ),
    ).toBeNull();
  });
});

describe("VIAF ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches VIAF, imports matching records, and upserts a mapped profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        searchRetrieveResponse: {
          records: {
            record: viafRecord("60028232", "Smith, Jane, 1965-", {
              birthDate: "1965",
              nameType: "Personal",
              nationality: "United States",
            }),
          },
        },
      }),
    } as unknown as Response);

    const result = await ingestViafAuthorityRecords({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("https://viaf.org/viaf/search");
    const parsed = new URL(requestedUrl);
    expect(parsed.searchParams.get("query")).toBe('local.names all "Jane Smith"');

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);

    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = (upsertProfile as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(profile.id).toBe("p_viaf_60028232");
    expect(profile.fullName).toBe("Smith, Jane, 1965-");
    expect(profile.aliases).toContain("VIAF ID: 60028232");
    expect(profile.aliases).toContain("Name type: Personal");
    expect(profile.aliases).toContain("Nationality metadata: United States");
    expect(profile.aliases).toContain("Birth date metadata: 1965");
    expect(profile.sourceRecord.sourceId).toBe("viaf_authority_search");
    expect(profile.sourceRecord.raw).toEqual(
      viafRecord("60028232", "Smith, Jane, 1965-", {
        birthDate: "1965",
        nameType: "Personal",
        nationality: "United States",
      }),
    );

    fetchMock.mockRestore();
  });

  it("skips records whose heading does not match the query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        searchRetrieveResponse: {
          records: {
            record: [
              viafRecord("1", "Jones, Alex, 1970-"),
              viafRecord("2", "Brown, Casey, 1950-"),
            ],
          },
        },
      }),
    } as unknown as Response);

    const result = await ingestViafAuthorityRecords({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("throws when the VIAF request fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as unknown as Response);

    await expect(
      ingestViafAuthorityRecords({ query: "Jane Smith" }),
    ).rejects.toThrow(/VIAF request failed/);

    expect(upsertProfile).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("handles an empty response without importing anything", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ searchRetrieveResponse: { records: {} } }),
    } as unknown as Response);

    const result = await ingestViafAuthorityRecords({ query: "Jane Smith" });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });
});

function viafRecord(
  viafId: string,
  heading: string,
  overrides?: { birthDate?: string; nameType?: string; nationality?: string },
) {
  return {
    recordData: {
      "ns2:VIAFCluster": {
        "ns2:viafID": viafId,
        "ns2:birthDate": overrides?.birthDate ?? "1835",
        "ns2:nameType": overrides?.nameType,
        "ns2:nationalityOfEntity": overrides?.nationality,
        "ns2:mainHeadings": {
          "ns2:data": {
            "ns2:text": heading,
          },
        },
      },
    },
  };
}
