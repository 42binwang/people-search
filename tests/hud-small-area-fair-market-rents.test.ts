import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHudSmallAreaFairMarketRentsUrl,
  ingestHudSmallAreaFairMarketRents,
  mapHudSmallAreaFairMarketRentFeature,
  parseHudSmallAreaFairMarketRentFeatures,
} from "@/lib/sources/hud-small-area-fair-market-rents";

const source = {
  sourceId: "hud_safmr_2026_bay_area_fmr_areas",
  sourceName:
    "HUD Small Area Fair Market Rents 2026 - Bay Area FMR Area ZIP Metrics",
  hub: "Bay Area",
  fiscalYear: 2026,
  tableUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer/1",
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
    HUD_CODE: "METRO41860MM5775",
    FMR_NAME: "Oakland-Fremont, CA HUD Metro FMR Area",
    ID: "94513",
    ZCTA_ID: null,
    SAFMR_0BR: 2320,
    SAFMR_0BR_90_Payment_Standard: 2090,
    SAFMR_0BR_110_Payment_Standard: 2550,
    SAFMR_1BR: 2630,
    SAFMR_1BR_90_Payment_Standard: 2370,
    SAFMR_1BR_110_Payment_Standard: 2890,
    SAFMR_2BR: 3110,
    SAFMR_2BR_90_Payment_Standard: 2800,
    SAFMR_2BR_110_Payment_Standard: 3420,
    SAFMR_3BR: 3960,
    SAFMR_3BR_90_Payment_Standard: 3560,
    SAFMR_3BR_110_Payment_Standard: 4360,
    SAFMR_4BR: 4510,
    SAFMR_4BR_90_Payment_Standard: 4060,
    SAFMR_4BR_110_Payment_Standard: 4960,
  },
};

describe("HUD small area fair market rents source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS table query URLs for rent fields and no geometry/address fields", () => {
    const url = new URL(
      buildHudSmallAreaFairMarketRentsUrl(source, {
        offset: 1000,
        pageSize: 500,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer/1/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "FMR_NAME IN ('Napa, CA MSA','Oakland-Fremont, CA HUD Metro FMR Area')",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "HUD_CODE,FMR_NAME,ID,ZCTA_ID,SAFMR_0BR,SAFMR_0BR_90_Payment_Standard,SAFMR_0BR_110_Payment_Standard,SAFMR_1BR,SAFMR_1BR_90_Payment_Standard,SAFMR_1BR_110_Payment_Standard,SAFMR_2BR,SAFMR_2BR_90_Payment_Standard,SAFMR_2BR_110_Payment_Standard,SAFMR_3BR,SAFMR_3BR_90_Payment_Standard,SAFMR_3BR_110_Payment_Standard,SAFMR_4BR,SAFMR_4BR_90_Payment_Standard,SAFMR_4BR_110_Payment_Standard",
    );
    expect(url.searchParams.get("resultOffset")).toBe("1000");
    expect(url.searchParams.get("resultRecordCount")).toBe("500");
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
    expect(url.searchParams.toString()).not.toContain("TENANT");
    expect(url.searchParams.toString()).not.toContain("PARTICIPANT");
    expect(url.searchParams.toString()).not.toContain("Shape__Area");
    expect(url.searchParams.toString()).not.toContain("INTPTLAT");
    expect(url.searchParams.toString()).not.toContain("INTPTLON");
  });

  it("maps SAFMR rows to ZIP/FMR rent metrics using ID when ZCTA_ID is blank", () => {
    const metric = mapHudSmallAreaFairMarketRentFeature(oaklandFeature, source);

    expect(metric).toMatchObject({
      sourceId: "hud_safmr_2026_bay_area_fmr_areas",
      sourceRecordId: "2026-METRO41860MM5775-94513",
      hub: "Bay Area",
      fiscalYear: 2026,
      hudCode: "METRO41860MM5775",
      fmrName: "Oakland-Fremont, CA HUD Metro FMR Area",
      zcta: "94513",
      safmr0br: 2320,
      safmr0brPaymentStandard90: 2090,
      safmr0brPaymentStandard110: 2550,
      safmr1br: 2630,
      safmr2br: 3110,
      safmr3br: 3960,
      safmr4br: 4510,
      raw: {
        fieldPolicy:
          "HUD SAFMR rent and payment-standard values by ZCTA and HUD FMR area.",
      },
    });
  });

  it("filters parsed rows to configured Bay Area FMR names", () => {
    const metrics = parseHudSmallAreaFairMarketRentFeatures(
      [
        oaklandFeature,
        {
          attributes: {
            ...oaklandFeature.attributes,
            HUD_CODE: "METRO42100M42100",
            FMR_NAME: "Santa Cruz-Watsonville, CA MSA",
            ID: "95041",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].zcta).toBe("94513");
  });

  it("stores malformed rent values as null", () => {
    const metric = mapHudSmallAreaFairMarketRentFeature(
      {
        attributes: {
          ...oaklandFeature.attributes,
          SAFMR_2BR: "-",
          SAFMR_2BR_90_Payment_Standard: "not available",
        },
      },
      source,
    );

    expect(metric.safmr2br).toBeNull();
    expect(metric.safmr2brPaymentStandard90).toBeNull();
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      mapHudSmallAreaFairMarketRentFeature(
        { attributes: { HUD_CODE: "METRO41860MM5775" } },
        source,
      ),
    ).toThrow("missing field: FMR_NAME");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudSmallAreaFairMarketRents(source)).rejects.toThrow(
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

    await expect(ingestHudSmallAreaFairMarketRents(source)).rejects.toThrow(
      "HUD small area fair market rents request failed: 503",
    );
  });

  it("downloads, paginates, maps, and imports SAFMR rows", async () => {
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

    const result = await ingestHudSmallAreaFairMarketRents({
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

    await expect(ingestHudSmallAreaFairMarketRents(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
