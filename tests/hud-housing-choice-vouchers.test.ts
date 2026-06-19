import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHudHousingChoiceVouchersUrl,
  ingestHudHousingChoiceVouchers,
  mapHudHousingChoiceVoucherFeature,
  parseHudHousingChoiceVouchersResponse,
} from "@/lib/sources/hud-housing-choice-vouchers";

const source = {
  sourceId: "hud_hcv_2025_bay_area_tracts",
  sourceName: "HUD Housing Choice Vouchers by Census Tract - Bay Area",
  hub: "Bay Area",
  coveragePeriod: "Up to 12/2025",
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Housing_Choice_Vouchers_by_Tract/FeatureServer/0",
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
    EANAME: "Census Tract 4001, Alameda County, California",
    HCV_PUBLIC: 42,
    HCV_PUBLIC_PCT: 6.25,
  },
};

describe("HUD housing choice vouchers source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for configured counties and aggregate fields only", () => {
    const url = new URL(
      buildHudHousingChoiceVouchersUrl(source, {
        offset: 2000,
        pageSize: 1000,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/Housing_Choice_Vouchers_by_Tract/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "(STATE = '06' AND COUNTY IN ('001','013'))",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "GEOID,STATE,COUNTY,TRACT,EANAME,HCV_PUBLIC,HCV_PUBLIC_PCT",
    );
    expect(url.searchParams.get("resultOffset")).toBe("2000");
    expect(url.searchParams.get("resultRecordCount")).toBe("1000");
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
    expect(url.searchParams.toString()).not.toContain("TENANT");
    expect(url.searchParams.toString()).not.toContain("PARTICIPANT");
  });

  it("maps tract attributes to housing assistance metrics", () => {
    const metric = mapHudHousingChoiceVoucherFeature(alamedaFeature, source);

    expect(metric).toMatchObject({
      sourceId: "hud_hcv_2025_bay_area_tracts",
      sourceRecordId: "up-to-12-2025-06001400100",
      hub: "Bay Area",
      coveragePeriod: "Up to 12/2025",
      stateFips: "06",
      countyFips: "001",
      tractFips: "400100",
      geoid: "06001400100",
      geographyName: "Census Tract 4001, Alameda County, California",
      housingChoiceVouchers: 42,
      housingChoiceVoucherPct: 6.25,
    });
  });

  it("filters parsed ArcGIS features to target Bay Area counties", () => {
    const metrics = parseHudHousingChoiceVouchersResponse(
      {
        features: [
          alamedaFeature,
          {
            attributes: {
              ...alamedaFeature.attributes,
              GEOID: "06085000100",
              COUNTY: "085",
              TRACT: "000100",
              EANAME: "Census Tract 1, Santa Clara County, California",
            },
          },
        ],
      },
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].geoid).toBe("06001400100");
  });

  it("stores unavailable numeric fields as null", () => {
    const metric = mapHudHousingChoiceVoucherFeature(
      {
        attributes: {
          ...alamedaFeature.attributes,
          HCV_PUBLIC: "-",
          HCV_PUBLIC_PCT: "not available",
        },
      },
      source,
    );

    expect(metric.housingChoiceVouchers).toBeNull();
    expect(metric.housingChoiceVoucherPct).toBeNull();
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", () => {
    expect(() =>
      parseHudHousingChoiceVouchersResponse({ features: [] }, source),
    ).not.toThrow();

    expect(() =>
      parseHudHousingChoiceVouchersResponse(
        { error: { message: "bad where clause" } },
        source,
      ),
    ).toThrow("ArcGIS error: bad where clause");

    expect(() =>
      mapHudHousingChoiceVoucherFeature(
        { attributes: { GEOID: "06001400100" } },
        source,
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

    await expect(ingestHudHousingChoiceVouchers(source)).rejects.toThrow(
      "HUD housing choice vouchers request failed: 503",
    );
  });

  it("downloads, maps, paginates, and imports aggregate tract rows", async () => {
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
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            features: [],
          }),
        ),
      );

    const result = await ingestHudHousingChoiceVouchers({
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

    await expect(ingestHudHousingChoiceVouchers(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
