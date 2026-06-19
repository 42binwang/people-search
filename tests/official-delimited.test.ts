import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestOfficialDelimitedRecords,
  mapOfficialDelimitedRowToProfileInput,
  parseOfficialDelimitedRecords,
} from "@/lib/sources/official-delimited";

const source = {
  sourceId: "county_bulk_parcels",
  fields: {
    recordId: "parcel_id",
    name: "owner_name",
    street: "site_address",
    city: "site_city",
    state: "site_state",
    zip: "site_zip",
    updatedAt: "last_update",
  },
};

describe("Official delimited source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved delimited records and imports mapped profiles", async () => {
    const csv = [
      "parcel_id,owner_name,site_address,site_city,site_state,site_zip",
      "B-200,RILEY JONES,200 HILL ST,MADISON,wi,53703",
      "B-201,ALEX SMITH,201 HILL ST,MADISON,wi,53703",
    ].join("\n");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(csv));

    const result = await ingestOfficialDelimitedRecords({
      sourceId: source.sourceId,
      sourceName: "County Bulk Parcels",
      jurisdiction: "Test County",
      url: "https://files.example.test/parcels.csv",
      fields: source.fields,
      query: "Riley Jones",
    });

    expect(result).toMatchObject({
      fetched: 1,
      imported: 1,
      url: "https://files.example.test/parcels.csv",
    });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("parses official TSV/CSV-style bulk records", () => {
    const rows = parseOfficialDelimitedRecords(
      "parcel_id\towner_name\tsite_city\tsite_state\nA-1\tJane Smith\tAustin\tTX\n",
      "\t",
    );

    expect(rows).toEqual([
      {
        parcel_id: "A-1",
        owner_name: "Jane Smith",
        site_city: "Austin",
        site_state: "TX",
      },
    ]);
  });

  it("maps approved delimited rows to public property record profiles", () => {
    const profile = mapOfficialDelimitedRowToProfileInput(
      {
        parcel_id: "B-200",
        owner_name: "RILEY JONES",
        site_address: "200 HILL ST",
        site_city: "MADISON",
        site_state: "wi",
        site_zip: "53703",
        last_update: "2026-06-01",
      },
      source,
    );

    expect(profile?.id).toBe("p_county_bulk_parcels_b_200");
    expect(profile?.fullName).toBe("Riley Jones");
    expect(profile?.aliases).toContain("Source updated: 2026-06-01");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "200 HILL ST",
      city: "Madison",
      state: "WI",
      zip: "53703",
      kind: "public property record",
      sourceId: "county_bulk_parcels",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_bulk_parcels",
      sourceRecordId: "B-200",
    });
  });

  it("skips rows without required identity or address fields", () => {
    expect(
      mapOfficialDelimitedRowToProfileInput(
        {
          parcel_id: "B-200",
          owner_name: "Riley Jones",
          site_state: "WI",
        },
        source,
      ),
    ).toBeNull();
  });
});
