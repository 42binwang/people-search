import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestCkanDataStore,
  mapCkanRecordToProfileInput,
} from "@/lib/sources/ckan";

const source = {
  sourceId: "county_parcel_ckan",
  fields: {
    recordId: "parcel_number",
    name: "owner",
    street: "property_address",
    city: "property_city",
    state: "property_state",
    zip: "property_zip",
    updatedAt: "updated",
  },
};

describe("CKAN DataStore source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved DataStore records and imports mapped profiles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: {
            records: [
              {
                parcel_number: "CK-1001",
                owner: "MARY A PUBLIC",
                property_address: "10 MARKET ST",
                property_city: "DENVER",
                property_state: "co",
                property_zip: "80202",
              },
            ],
          },
        }),
      ),
    );

    const result = await ingestCkanDataStore({
      sourceId: source.sourceId,
      sourceName: "County Parcel CKAN",
      jurisdiction: "Test County",
      portalUrl: "https://catalog.example.test",
      resourceId: "resource-123",
      fields: source.fields,
      query: "Mary Public",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/api/3/action/datastore_search");
    expect(requestedUrl.searchParams.get("resource_id")).toBe("resource-123");
    expect(requestedUrl.searchParams.get("q")).toBe("Mary Public");
    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("maps approved records to public property record profiles", () => {
    const profile = mapCkanRecordToProfileInput(
      {
        parcel_number: "CK-1001",
        owner: "MARY A PUBLIC",
        property_address: "10 MARKET ST",
        property_city: "DENVER",
        property_state: "co",
        property_zip: "80202",
        updated: "2026-03-10",
      },
      source,
    );

    expect(profile?.id).toBe("p_county_parcel_ckan_ck_1001");
    expect(profile?.fullName).toBe("Mary A Public");
    expect(profile?.aliases).toContain("Source updated: 2026-03-10");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "10 MARKET ST",
      city: "Denver",
      state: "CO",
      zip: "80202",
      kind: "public property record",
      sourceId: "county_parcel_ckan",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_parcel_ckan",
      sourceRecordId: "CK-1001",
    });
  });

  it("skips records without required identity or address fields", () => {
    expect(
      mapCkanRecordToProfileInput(
        {
          parcel_number: "CK-1001",
          owner: "Mary Public",
          property_city: "Denver",
        },
        source,
      ),
    ).toBeNull();
  });
});
