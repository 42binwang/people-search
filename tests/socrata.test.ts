import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestSocrataOpenData,
  mapSocrataRowToProfileInput,
} from "@/lib/sources/socrata";

const source = {
  sourceId: "county_parcel_socrata",
  fields: {
    recordId: "parcel_id",
    name: "owner_name",
    street: "situs_address",
    city: "situs_city",
    state: "situs_state",
    zip: "situs_zip",
    updatedAt: "last_modified",
  },
};

describe("Socrata open-data source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved SODA rows and imports mapped profiles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            parcel_id: "123-456",
            owner_name: "JANE Q SMITH",
            situs_address: "100 MAIN ST",
            situs_city: "AUSTIN",
            situs_state: "tx",
            situs_zip: "78701",
          },
        ]),
      ),
    );

    const result = await ingestSocrataOpenData({
      sourceId: source.sourceId,
      sourceName: "County Parcel Socrata",
      jurisdiction: "Test County",
      domain: "data.example.test",
      datasetId: "abcd-1234",
      fields: source.fields,
      query: "Jane Smith",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.hostname).toBe("data.example.test");
    expect(requestedUrl.pathname).toBe("/resource/abcd-1234.json");
    expect(requestedUrl.searchParams.get("$q")).toBe("Jane Smith");
    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("maps approved property rows to public property record profiles", () => {
    const profile = mapSocrataRowToProfileInput(
      {
        parcel_id: "123-456",
        owner_name: "JANE Q SMITH",
        situs_address: "100 MAIN ST",
        situs_city: "AUSTIN",
        situs_state: "tx",
        situs_zip: "78701",
        last_modified: "2026-01-15T12:00:00",
      },
      source,
    );

    expect(profile?.id).toBe("p_county_parcel_socrata_123_456");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.aliases).toContain("Source updated: 2026-01-15T12:00:00");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "100 MAIN ST",
      city: "Austin",
      state: "TX",
      zip: "78701",
      kind: "public property record",
      sourceId: "county_parcel_socrata",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_parcel_socrata",
      sourceRecordId: "123-456",
    });
  });

  it("skips rows without required identity or address fields", () => {
    expect(
      mapSocrataRowToProfileInput(
        {
          parcel_id: "123",
          owner_name: "",
          situs_city: "Austin",
          situs_state: "TX",
        },
        source,
      ),
    ).toBeNull();
  });
});
