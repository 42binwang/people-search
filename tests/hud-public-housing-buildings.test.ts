import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateHudPublicHousingBuildings,
  buildHudPublicHousingBuildingsUrl,
  ingestHudPublicHousingBuildings,
} from "@/lib/sources/hud-public-housing-buildings";

const source = {
  sourceId: "hud_public_housing_buildings_2025_bay_area_counties",
  sourceName: "HUD Public Housing Buildings - Bay Area County Inventory",
  hub: "Bay Area",
  coveragePeriod: "Up to 12/2025",
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Public_Housing_Buildings/FeatureServer/0",
  counties: [
    { label: "Alameda County, California", state: "6", county: "1" },
    { label: "Contra Costa County, California", state: "06", county: "013" },
  ],
};

const alamedaFeature = {
  attributes: {
    STATE2KX: "06",
    CNTY2KX: "001",
    CNTY_NM2KX: "Alameda",
    TOTAL_DWELLING_UNITS: 10,
    TOTAL_UNITS: 12,
    TOTAL_OCCUPIED: 8,
    REGULAR_VACANT: 2,
    NUMBER_REPORTED: 11,
    PEOPLE_TOTAL: 20,
    PCT_OCCUPIED: 80,
  },
};

describe("HUD public housing buildings source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for county aggregates and non-address fields only", () => {
    const url = new URL(
      buildHudPublicHousingBuildingsUrl(source, {
        offset: 1000,
        pageSize: 500,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/Public_Housing_Buildings/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "(STATE2KX = '06' AND CNTY2KX IN ('001','013'))",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "STATE2KX,CNTY2KX,CNTY_NM2KX,TOTAL_DWELLING_UNITS,TOTAL_UNITS,TOTAL_OCCUPIED,REGULAR_VACANT,NUMBER_REPORTED,PEOPLE_TOTAL,PCT_OCCUPIED",
    );
    expect(url.searchParams.get("resultOffset")).toBe("1000");
    expect(url.searchParams.get("resultRecordCount")).toBe("500");
    expect(url.searchParams.toString()).not.toContain("STD_ADDR");
    expect(url.searchParams.toString()).not.toContain("LAT");
    expect(url.searchParams.toString()).not.toContain("LON");
    expect(url.searchParams.toString()).not.toContain("EMAIL");
    expect(url.searchParams.toString()).not.toContain("PHONE");
    expect(url.searchParams.toString()).not.toContain("PROJECT_NAME");
  });

  it("aggregates selected building rows into county inventory metrics", () => {
    const metrics = aggregateHudPublicHousingBuildings(
      [
        alamedaFeature,
        {
          attributes: {
            ...alamedaFeature.attributes,
            TOTAL_DWELLING_UNITS: 5,
            TOTAL_UNITS: 6,
            TOTAL_OCCUPIED: 3,
            REGULAR_VACANT: 2,
            NUMBER_REPORTED: 12,
            PEOPLE_TOTAL: 9,
            PCT_OCCUPIED: 50,
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      sourceId: "hud_public_housing_buildings_2025_bay_area_counties",
      sourceRecordId: "up-to-12-2025-06001",
      hub: "Bay Area",
      coveragePeriod: "Up to 12/2025",
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda",
      buildingCount: 2,
      totalDwellingUnits: 15,
      totalUnits: 18,
      occupiedUnits: 11,
      vacantUnits: 4,
      numberReported: 23,
      peopleTotal: 29,
      averagePctOccupied: 65,
    });
  });

  it("filters non-target counties and excludes suppressed negative values", () => {
    const metrics = aggregateHudPublicHousingBuildings(
      [
        {
          attributes: {
            ...alamedaFeature.attributes,
            TOTAL_DWELLING_UNITS: -4,
            TOTAL_UNITS: "-4",
            TOTAL_OCCUPIED: 8,
            REGULAR_VACANT: 2,
            NUMBER_REPORTED: 9,
            PEOPLE_TOTAL: -4,
            PCT_OCCUPIED: -4,
          },
        },
        {
          attributes: {
            ...alamedaFeature.attributes,
            CNTY2KX: "085",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].buildingCount).toBe(1);
    expect(metrics[0].totalDwellingUnits).toBeNull();
    expect(metrics[0].totalUnits).toBeNull();
    expect(metrics[0].occupiedUnits).toBe(8);
    expect(metrics[0].peopleTotal).toBeNull();
    expect(metrics[0].averagePctOccupied).toBeNull();
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      aggregateHudPublicHousingBuildings(
        [{ attributes: { STATE2KX: "06", CNTY2KX: "001" } }],
        source,
      ),
    ).toThrow("missing field: CNTY_NM2KX");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudPublicHousingBuildings(source)).rejects.toThrow(
      "ArcGIS error: bad where clause",
    );
  });

  it("surfaces failed downloads before importing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(ingestHudPublicHousingBuildings(source)).rejects.toThrow(
      "HUD public housing buildings request failed: 503",
    );
  });

  it("downloads, paginates, aggregates, and imports county inventory rows", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            features: [alamedaFeature],
            exceededTransferLimit: true,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: [] })));

    const result = await ingestHudPublicHousingBuildings({
      ...source,
      pageSize: 1,
      maxPages: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      fetched: 1,
      imported: 1,
    });
    expect(new URL(result.urls[1]).searchParams.get("resultOffset")).toBe("1");
  });

  it("throws explicit errors for non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(ingestHudPublicHousingBuildings(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
