import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHudResidentialConstructionPermitsUrl,
  ingestHudResidentialConstructionPermits,
  mapHudResidentialConstructionPermitsFeature,
  parseHudResidentialConstructionPermitsResponse,
} from "@/lib/sources/hud-residential-construction-permits";

const source = {
  sourceId: "hud_bps_2022_bay_area_residential_construction_permits",
  sourceName: "HUD Residential Construction Permits by County",
  hub: "Bay Area",
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Residential_Construction_Permits_by_County/FeatureServer/24",
  years: [2021, 2022],
  counties: [
    { label: "Alameda County, California", state: "6", county: "1" },
    { label: "Contra Costa County, California", state: "06", county: "013" },
  ],
};

const alamedaFeature = {
  attributes: {
    GEOID: "06001",
    STATE: "06",
    COUNTY: "001",
    NAME: "Alameda",
    STATE_NAME: "California",
    ALL_PERMITS_2021: 4655,
    SINGLE_FAMILY_PERMITS_2021: 445,
    ALL_MULTIFAMILY_PERMITS_2021: 4210,
    ALL_PERMITS_2022: 3148.4,
    SINGLE_FAMILY_PERMITS_2022: 382.1,
    ALL_MULTIFAMILY_PERMITS_2022: 2766.3,
  },
};

describe("HUD residential construction permits source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for configured counties and non-personal permit fields", () => {
    const url = new URL(buildHudResidentialConstructionPermitsUrl(source));

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/Residential_Construction_Permits_by_County/FeatureServer/24/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "(STATE = '06' AND COUNTY IN ('001','013'))",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "GEOID,STATE,COUNTY,NAME,STATE_NAME,ALL_PERMITS_2021,SINGLE_FAMILY_PERMITS_2021,ALL_MULTIFAMILY_PERMITS_2021,ALL_PERMITS_2022,SINGLE_FAMILY_PERMITS_2022,ALL_MULTIFAMILY_PERMITS_2022",
    );
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
  });

  it("maps county attributes to annual residential construction permit metrics", () => {
    const metric = mapHudResidentialConstructionPermitsFeature(
      alamedaFeature,
      source,
      2022,
    );

    expect(metric).toMatchObject({
      sourceId: "hud_bps_2022_bay_area_residential_construction_permits",
      sourceRecordId: "2022-06001",
      hub: "Bay Area",
      year: 2022,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda",
      stateName: "California",
      allPermits: 3148,
      singleFamilyPermits: 382,
      multifamilyPermits: 2766,
    });
  });

  it("parses all configured years and target counties from ArcGIS features", () => {
    const metrics = parseHudResidentialConstructionPermitsResponse(
      {
        features: [
          alamedaFeature,
          {
            attributes: {
              ...alamedaFeature.attributes,
              GEOID: "06085",
              COUNTY: "085",
              NAME: "Santa Clara",
            },
          },
        ],
      },
      source,
    );

    expect(metrics).toHaveLength(2);
    expect(metrics.map((metric) => metric.sourceRecordId)).toEqual([
      "2021-06001",
      "2022-06001",
    ]);
  });

  it("stores unavailable numeric fields as null", () => {
    const metric = mapHudResidentialConstructionPermitsFeature(
      {
        attributes: {
          ...alamedaFeature.attributes,
          ALL_PERMITS_2022: null,
          SINGLE_FAMILY_PERMITS_2022: "-",
          ALL_MULTIFAMILY_PERMITS_2022: "not available",
        },
      },
      source,
      2022,
    );

    expect(metric.allPermits).toBeNull();
    expect(metric.singleFamilyPermits).toBeNull();
    expect(metric.multifamilyPermits).toBeNull();
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", () => {
    expect(() =>
      parseHudResidentialConstructionPermitsResponse({ features: [] }, source),
    ).not.toThrow();

    expect(() =>
      parseHudResidentialConstructionPermitsResponse(
        { error: { message: "bad where clause" } },
        source,
      ),
    ).toThrow("ArcGIS error: bad where clause");

    expect(() =>
      mapHudResidentialConstructionPermitsFeature(
        { attributes: { GEOID: "06001" } },
        source,
        2022,
      ),
    ).toThrow("missing field: STATE");
  });

  it("surfaces failed downloads before importing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      ingestHudResidentialConstructionPermits(source),
    ).rejects.toThrow(
      "HUD residential construction permits request failed: 503",
    );
  });

  it("downloads, maps, and imports aggregate county-year rows", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ features: [alamedaFeature] })),
    );

    const result = await ingestHudResidentialConstructionPermits(source);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      fetched: 1,
      imported: 2,
    });
  });

  it("throws explicit errors for non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestHudResidentialConstructionPermits(source),
    ).rejects.toThrow("not valid JSON");
  });
});
