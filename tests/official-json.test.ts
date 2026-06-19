import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  extractOfficialJsonRecords,
  ingestOfficialJsonRecords,
  mapOfficialJsonRecordToProfileInput,
} from "@/lib/sources/official-json";

const source = {
  sourceId: "county_custom_json",
  fields: {
    recordId: "parcel.id",
    name: "owner.name",
    street: "site.street",
    city: "site.city",
    state: "site.state",
    zip: "site.zip",
    updatedAt: "meta.updated",
  },
};

describe("Official JSON source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved JSON records and imports mapped profiles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            records: [
              {
                parcel: { id: "JSON-77" },
                owner: { name: "SAM R PATEL" },
                site: {
                  street: "77 WALNUT LN",
                  city: "COLUMBUS",
                  state: "oh",
                  zip: "43004",
                },
              },
            ],
          },
        }),
      ),
    );

    const result = await ingestOfficialJsonRecords({
      sourceId: source.sourceId,
      sourceName: "County Custom JSON",
      jurisdiction: "Test County",
      url: "https://api.example.test/parcels",
      fields: source.fields,
      recordsPath: "data.records",
      queryParam: "search",
      query: "Sam Patel",
      limitParam: "limit",
      limit: 10,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("search")).toBe("Sam Patel");
    expect(requestedUrl.searchParams.get("limit")).toBe("10");
    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("extracts records from a configured nested response path", () => {
    const records = extractOfficialJsonRecords(
      {
        data: {
          records: [{ id: "1" }, { id: "2" }, "bad"],
        },
      },
      "data.records",
    );

    expect(records).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("maps approved nested JSON records to public property record profiles", () => {
    const profile = mapOfficialJsonRecordToProfileInput(
      {
        parcel: { id: "JSON-77" },
        owner: { name: "SAM R PATEL" },
        site: {
          street: "77 WALNUT LN",
          city: "COLUMBUS",
          state: "oh",
          zip: "43004",
        },
        meta: {
          updated: "2026-05-14",
        },
      },
      source,
    );

    expect(profile?.id).toBe("p_county_custom_json_json_77");
    expect(profile?.fullName).toBe("Sam R Patel");
    expect(profile?.aliases).toContain("Source updated: 2026-05-14");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "77 WALNUT LN",
      city: "Columbus",
      state: "OH",
      zip: "43004",
      kind: "public property record",
      sourceId: "county_custom_json",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_custom_json",
      sourceRecordId: "JSON-77",
    });
  });

  it("skips records without required identity or address fields", () => {
    expect(
      mapOfficialJsonRecordToProfileInput(
        {
          parcel: { id: "JSON-77" },
          owner: { name: "Sam Patel" },
          site: { state: "OH" },
        },
        source,
      ),
    ).toBeNull();
  });
});
