import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateHudLihtcProperties,
  buildHudLihtcPropertiesUrl,
  ingestHudLihtcProperties,
} from "@/lib/sources/hud-lihtc-properties";

const source = {
  sourceId: "hud_lihtc_properties_bay_area_counties",
  sourceName:
    "HUD Low-Income Housing Tax Credit Properties - Bay Area County Inventory",
  hub: "Bay Area",
  coveragePeriod: "HUD LIHTC national database current service layer",
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0",
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
    N_UNITS: 100,
    LI_UNITS: 80,
    N_0BR: 5,
    N_1BR: 20,
    N_2BR: 45,
    N_3BR: 25,
    N_4BR: 5,
    ALLOCAMT: 1250000.5,
    YR_PIS: "2018",
    YR_ALLOC: "2016",
  },
};

describe("HUD LIHTC properties source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for county aggregates and non-address fields only", () => {
    const url = new URL(
      buildHudLihtcPropertiesUrl(source, {
        offset: 2000,
        pageSize: 1000,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "(STATE2KX = '6' AND CNTY2KX IN ('1','13'))",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "STATE2KX,CNTY2KX,CNTY_NM2KX,N_UNITS,LI_UNITS,N_0BR,N_1BR,N_2BR,N_3BR,N_4BR,ALLOCAMT,YR_PIS,YR_ALLOC",
    );
    expect(url.searchParams.get("resultOffset")).toBe("2000");
    expect(url.searchParams.get("resultRecordCount")).toBe("1000");
    expect(url.searchParams.toString()).not.toContain("PROJECT");
    expect(url.searchParams.toString()).not.toContain("PROJ_ADD");
    expect(url.searchParams.toString()).not.toContain("CONTACT");
    expect(url.searchParams.toString()).not.toContain("COMPANY");
    expect(url.searchParams.toString()).not.toContain("STD_ADDR");
    expect(url.searchParams.toString()).not.toContain("LAT");
    expect(url.searchParams.toString()).not.toContain("LON");
  });

  it("aggregates LIHTC project rows into county inventory metrics", () => {
    const metrics = aggregateHudLihtcProperties(
      [
        alamedaFeature,
        {
          attributes: {
            ...alamedaFeature.attributes,
            N_UNITS: 50,
            LI_UNITS: 40,
            N_0BR: 0,
            N_1BR: 10,
            N_2BR: 20,
            N_3BR: 15,
            N_4BR: 5,
            ALLOCAMT: 750000,
            YR_PIS: "2020",
            YR_ALLOC: "2019",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      sourceId: "hud_lihtc_properties_bay_area_counties",
      sourceRecordId: "hud-lihtc-national-database-current-service-layer-06001",
      hub: "Bay Area",
      coveragePeriod: "HUD LIHTC national database current service layer",
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda",
      projectCount: 2,
      totalUnits: 150,
      lowIncomeUnits: 120,
      zeroBedroomUnits: 5,
      oneBedroomUnits: 30,
      twoBedroomUnits: 65,
      threeBedroomUnits: 40,
      fourPlusBedroomUnits: 10,
      allocationAmount: 2000000.5,
      earliestPlacedInServiceYear: 2018,
      latestPlacedInServiceYear: 2020,
      earliestAllocationYear: 2016,
      latestAllocationYear: 2019,
    });
  });

  it("filters non-target counties and excludes malformed numeric values", () => {
    const metrics = aggregateHudLihtcProperties(
      [
        {
          attributes: {
            ...alamedaFeature.attributes,
            N_UNITS: -1,
            LI_UNITS: "bad",
            ALLOCAMT: null,
            YR_PIS: "1800",
            YR_ALLOC: "not a year",
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
    expect(metrics[0].projectCount).toBe(1);
    expect(metrics[0].totalUnits).toBeNull();
    expect(metrics[0].lowIncomeUnits).toBeNull();
    expect(metrics[0].allocationAmount).toBeNull();
    expect(metrics[0].earliestPlacedInServiceYear).toBeNull();
    expect(metrics[0].latestAllocationYear).toBeNull();
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      aggregateHudLihtcProperties(
        [{ attributes: { STATE2KX: "06", CNTY2KX: "001" } }],
        source,
      ),
    ).toThrow("missing field: CNTY_NM2KX");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudLihtcProperties(source)).rejects.toThrow(
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

    await expect(ingestHudLihtcProperties(source)).rejects.toThrow(
      "HUD LIHTC properties request failed: 503",
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

    const result = await ingestHudLihtcProperties({
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

    await expect(ingestHudLihtcProperties(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
