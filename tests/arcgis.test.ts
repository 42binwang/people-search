import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestArcGisFeatureLayer,
  mapArcGisFeatureToProfileInput,
} from "@/lib/sources/arcgis";

const source = {
  sourceId: "county_parcel_arcgis",
  fields: {
    recordId: "PARCEL_ID",
    name: "OWNER_NAME",
    street: "SITUS_ADDR",
    city: "SITUS_CITY",
    state: "SITUS_STATE",
    zip: "SITUS_ZIP",
    updatedAt: "EDIT_DATE",
  },
};

describe("ArcGIS FeatureServer source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved FeatureServer rows and imports mapped profiles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              attributes: {
                PARCEL_ID: "A-987",
                OWNER_NAME: "JOHN R DOE",
                SITUS_ADDR: "42 OAK AVE",
                SITUS_CITY: "PHOENIX",
                SITUS_STATE: "az",
                SITUS_ZIP: "85001",
              },
            },
          ],
        }),
      ),
    );

    const result = await ingestArcGisFeatureLayer({
      sourceId: source.sourceId,
      sourceName: "County Parcel ArcGIS",
      jurisdiction: "Test County",
      layerUrl: "https://example.test/FeatureServer/0",
      fields: source.fields,
      query: "John Doe",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/FeatureServer/0/query");
    expect(requestedUrl.searchParams.get("f")).toBe("json");
    expect(requestedUrl.searchParams.get("returnGeometry")).toBe("false");
    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("maps approved feature attributes to public property record profiles", () => {
    const profile = mapArcGisFeatureToProfileInput(
      {
        attributes: {
          PARCEL_ID: "A-987",
          OWNER_NAME: "JOHN R DOE",
          SITUS_ADDR: "42 OAK AVE",
          SITUS_CITY: "PHOENIX",
          SITUS_STATE: "az",
          SITUS_ZIP: "85001",
          EDIT_DATE: "2026-02-20",
        },
      },
      source,
    );

    expect(profile?.id).toBe("p_county_parcel_arcgis_a_987");
    expect(profile?.fullName).toBe("John R Doe");
    expect(profile?.aliases).toContain("Source updated: 2026-02-20");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "42 OAK AVE",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
      kind: "public property record",
      sourceId: "county_parcel_arcgis",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_parcel_arcgis",
      sourceRecordId: "A-987",
    });
  });

  it("skips features without required identity or address attributes", () => {
    expect(
      mapArcGisFeatureToProfileInput(
        {
          attributes: {
            PARCEL_ID: "A-987",
            OWNER_NAME: "John Doe",
            SITUS_STATE: "AZ",
          },
        },
        source,
      ),
    ).toBeNull();
  });
});
