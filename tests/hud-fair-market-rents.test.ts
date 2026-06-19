import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHudFairMarketRentsUrl,
  ingestHudFairMarketRents,
  mapHudFairMarketRentFeature,
  parseHudFairMarketRentFeatures,
} from "@/lib/sources/hud-fair-market-rents";

const source = {
  sourceId: "hud_fmr_2026_bay_area_fmr_areas",
  sourceName: "HUD Fair Market Rents 2026 - Bay Area FMR Area Metrics",
  hub: "Bay Area",
  fiscalYear: 2026,
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Fair_Market_Rents/FeatureServer/0",
  areas: [
    {
      label: "Napa, CA MSA",
      name: "Napa, CA MSA",
    },
    {
      label: "Oakland-Fremont, CA HUD Metro FMR Area",
      name: "Oakland-Fremont, CA HUD Metro FMR Area",
    },
  ],
};

const oaklandFeature = {
  attributes: {
    FMR_CODE: "METRO41860MM5775",
    FMR_AREANAME: "Oakland-Fremont, CA HUD Metro FMR Area",
    FMR_0BDR: 2142,
    FMR_1BDR: 2385,
    FMR_2BDR: 2912,
    FMR_3BDR: 3724,
    FMR_4BDR: 4413,
  },
};

describe("HUD fair market rents source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for area rent fields and no geometry/address fields", () => {
    const url = new URL(
      buildHudFairMarketRentsUrl(source, {
        offset: 1000,
        pageSize: 500,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/Fair_Market_Rents/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "FMR_AREANAME IN ('Napa, CA MSA','Oakland-Fremont, CA HUD Metro FMR Area')",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "FMR_CODE,FMR_AREANAME,FMR_0BDR,FMR_1BDR,FMR_2BDR,FMR_3BDR,FMR_4BDR",
    );
    expect(url.searchParams.get("resultOffset")).toBe("1000");
    expect(url.searchParams.get("resultRecordCount")).toBe("500");
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
    expect(url.searchParams.toString()).not.toContain("TENANT");
    expect(url.searchParams.toString()).not.toContain("PARTICIPANT");
    expect(url.searchParams.toString()).not.toContain("Shape__Area");
    expect(url.searchParams.toString()).not.toContain("Shape__Length");
  });

  it("maps HUD FMR features to area rent metrics", () => {
    const metric = mapHudFairMarketRentFeature(oaklandFeature, source);

    expect(metric).toMatchObject({
      sourceId: "hud_fmr_2026_bay_area_fmr_areas",
      sourceRecordId: "2026-METRO41860MM5775",
      hub: "Bay Area",
      fiscalYear: 2026,
      fmrCode: "METRO41860MM5775",
      fmrName: "Oakland-Fremont, CA HUD Metro FMR Area",
      fmr0br: 2142,
      fmr1br: 2385,
      fmr2br: 2912,
      fmr3br: 3724,
      fmr4br: 4413,
      raw: {
        fieldPolicy:
          "HUD FMR area-level rent values by bedroom count and HUD FMR area.",
      },
    });
  });

  it("filters parsed rows to configured Bay Area FMR names", () => {
    const metrics = parseHudFairMarketRentFeatures(
      [
        oaklandFeature,
        {
          attributes: {
            ...oaklandFeature.attributes,
            FMR_CODE: "METRO42100M42100",
            FMR_AREANAME: "Santa Cruz-Watsonville, CA MSA",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].fmrCode).toBe("METRO41860MM5775");
  });

  it("stores malformed rent values as null", () => {
    const metric = mapHudFairMarketRentFeature(
      {
        attributes: {
          ...oaklandFeature.attributes,
          FMR_2BDR: "-",
          FMR_3BDR: "not available",
        },
      },
      source,
    );

    expect(metric.fmr2br).toBeNull();
    expect(metric.fmr3br).toBeNull();
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      mapHudFairMarketRentFeature(
        { attributes: { FMR_CODE: "METRO41860MM5775" } },
        source,
      ),
    ).toThrow("missing field: FMR_AREANAME");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudFairMarketRents(source)).rejects.toThrow(
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

    await expect(ingestHudFairMarketRents(source)).rejects.toThrow(
      "HUD fair market rents request failed: 503",
    );
  });

  it("downloads, paginates, maps, and imports FMR rows", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            features: [oaklandFeature],
            exceededTransferLimit: true,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: [] })));

    const result = await ingestHudFairMarketRents({
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

    await expect(ingestHudFairMarketRents(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
