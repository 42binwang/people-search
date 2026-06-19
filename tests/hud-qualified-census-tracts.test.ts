import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateHudQualifiedCensusTracts,
  buildHudQualifiedCensusTractsUrl,
  ingestHudQualifiedCensusTracts,
} from "@/lib/sources/hud-qualified-census-tracts";

const source = {
  sourceId: "hud_qct_2026_bay_area_counties",
  sourceName: "HUD Qualified Census Tracts 2026 - Bay Area County Counts",
  hub: "Bay Area",
  fiscalYear: 2026,
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0",
  counties: [
    { label: "Alameda County, California", state: "6", county: "1" },
    { label: "Contra Costa County, California", state: "06", county: "013" },
  ],
};

const alamedaFeature = {
  attributes: {
    GEOID: "06001400100",
    STATE: "06",
    COUNTY: "001",
    TRACT: "400100",
    NAME: "Census Tract 4001",
  },
};

describe("HUD qualified census tracts source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for county counts and non-address fields only", () => {
    const url = new URL(
      buildHudQualifiedCensusTractsUrl(source, {
        offset: 2000,
        pageSize: 1000,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "(STATE = '06' AND COUNTY IN ('001','013'))",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "GEOID,STATE,COUNTY,TRACT,NAME",
    );
    expect(url.searchParams.get("resultOffset")).toBe("2000");
    expect(url.searchParams.get("resultRecordCount")).toBe("1000");
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
    expect(url.searchParams.toString()).not.toContain("TENANT");
    expect(url.searchParams.toString()).not.toContain("PARTICIPANT");
    expect(url.searchParams.toString()).not.toContain("LAT");
    expect(url.searchParams.toString()).not.toContain("LON");
  });

  it("aggregates qualifying tract rows into county inventory metrics", () => {
    const metrics = aggregateHudQualifiedCensusTracts(
      [
        alamedaFeature,
        {
          attributes: {
            ...alamedaFeature.attributes,
            GEOID: "06001400200",
            TRACT: "400200",
            NAME: "Census Tract 4002",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      sourceId: "hud_qct_2026_bay_area_counties",
      sourceRecordId: "2026-06001",
      hub: "Bay Area",
      fiscalYear: 2026,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      qualifiedTractCount: 2,
      raw: {
        tractGeoids: ["06001400100", "06001400200"],
        fieldPolicy: "County aggregate counts from HUD QCT tract identifiers.",
      },
    });
  });

  it("filters non-target counties before aggregation", () => {
    const metrics = aggregateHudQualifiedCensusTracts(
      [
        alamedaFeature,
        {
          attributes: {
            ...alamedaFeature.attributes,
            GEOID: "06085000100",
            COUNTY: "085",
            TRACT: "000100",
            NAME: "Census Tract 1",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
    expect(metrics[0].qualifiedTractCount).toBe(1);
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      aggregateHudQualifiedCensusTracts(
        [{ attributes: { GEOID: "06001400100", STATE: "06", COUNTY: "001" } }],
        source,
      ),
    ).toThrow("missing field: TRACT");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudQualifiedCensusTracts(source)).rejects.toThrow(
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

    await expect(ingestHudQualifiedCensusTracts(source)).rejects.toThrow(
      "HUD qualified census tracts request failed: 503",
    );
  });

  it("downloads, paginates, aggregates, and imports county count rows", async () => {
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

    const result = await ingestHudQualifiedCensusTracts({
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

    await expect(ingestHudQualifiedCensusTracts(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
