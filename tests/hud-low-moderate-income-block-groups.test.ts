import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateHudLowModerateIncomeBlockGroups,
  buildHudLowModerateIncomeBlockGroupsUrl,
  ingestHudLowModerateIncomeBlockGroups,
} from "@/lib/sources/hud-low-moderate-income-block-groups";

const source = {
  sourceId: "hud_low_mod_income_bg_2020_bay_area_counties",
  sourceName:
    "HUD Low/Moderate Income Population by Block Group - Bay Area County Rollups",
  hub: "Bay Area",
  coveragePeriod: "ACS 2016-2020",
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LOW_MOD_INCOME_BY_BG/FeatureServer/0",
  counties: [
    { label: "Alameda County, California", state: "06", county: "001" },
    { label: "Contra Costa County, California", state: "06", county: "013" },
  ],
};

const alamedaFeature = {
  attributes: {
    GEOID: "060014043002",
    Source: "ACS 2020-2016",
    geoname: "Block Group 2, Census Tract 4043, Alameda County, California",
    Stusab: "CA",
    Countyname: "Alameda County",
    State: "06",
    County: "001",
    Tract: "404300",
    BLKGRP: "2",
    Low: "25",
    Lowmod: "110",
    Lmmi: "210",
    Lowmoduniv: "1,025",
    Lowmod_pct: 0.107,
    uclow: "",
    uclowmod: "",
    ucLowmod_p: null,
    MOE_LOWMOD_PCT: "+/-8.40%",
    MOE_UCLOWMOD_PCT: " ",
  },
};

describe("HUD low/moderate income block groups source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for low/mod fields and no geometry/address fields", () => {
    const url = new URL(
      buildHudLowModerateIncomeBlockGroupsUrl(source, {
        offset: 2000,
        pageSize: 500,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/LOW_MOD_INCOME_BY_BG/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "(State = '06' AND County IN ('001','013'))",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "GEOID,Source,geoname,Stusab,Countyname,State,County,Tract,BLKGRP,Low,Lowmod,Lmmi,Lowmoduniv,Lowmod_pct,uclow,uclowmod,ucLowmod_p,MOE_LOWMOD_PCT,MOE_UCLOWMOD_PCT",
    );
    expect(url.searchParams.get("resultOffset")).toBe("2000");
    expect(url.searchParams.get("resultRecordCount")).toBe("500");
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
    expect(url.searchParams.toString()).not.toContain("TENANT");
    expect(url.searchParams.toString()).not.toContain("PHONE");
    expect(url.searchParams.toString()).not.toContain("Shape__Area");
    expect(url.searchParams.toString()).not.toContain("Shape__Length");
  });

  it("aggregates block-group rows to county low/moderate income metrics", () => {
    const metrics = aggregateHudLowModerateIncomeBlockGroups(
      [
        alamedaFeature,
        {
          attributes: {
            ...alamedaFeature.attributes,
            GEOID: "060014043003",
            Low: "125",
            Lowmod: "215",
            Lmmi: "430",
            Lowmoduniv: "1,300",
            Lowmod_pct: 0.165,
          },
        },
        {
          attributes: {
            ...alamedaFeature.attributes,
            GEOID: "060133551001",
            Countyname: "Contra Costa County",
            County: "013",
            Low: "300",
            Lowmod: "620",
            Lmmi: "800",
            Lowmoduniv: "1,000",
            Lowmod_pct: 0.62,
          },
        },
        {
          attributes: {
            ...alamedaFeature.attributes,
            GEOID: "060971506002",
            Countyname: "Sonoma County",
            County: "097",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({
      sourceId: "hud_low_mod_income_bg_2020_bay_area_counties",
      sourceRecordId: "ACS 2016-2020-06001",
      hub: "Bay Area",
      coveragePeriod: "ACS 2016-2020",
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      blockGroupCount: 2,
      lowPersons: 150,
      lowModPersons: 325,
      lowModerateMiddleIncomePersons: 640,
      lowModUniverse: 2325,
      blockGroups51PctPlus: 0,
    });
    expect(metrics[0].lowModPct).toBeCloseTo(325 / 2325, 6);
    expect(metrics[0].raw).toMatchObject({
      sourceValues: ["ACS 2020-2016"],
      fieldPolicy:
        "County aggregate rollups from HUD low/moderate income block-group counts; geometry and personal/address fields are not requested.",
    });
    expect(metrics[1]).toMatchObject({
      countyFips: "013",
      blockGroupCount: 1,
      lowModPersons: 620,
      lowModUniverse: 1000,
      lowModPct: 0.62,
      blockGroups51PctPlus: 1,
    });
  });

  it("stores malformed numeric values as null when all rows are unavailable", () => {
    const metrics = aggregateHudLowModerateIncomeBlockGroups(
      [
        {
          attributes: {
            ...alamedaFeature.attributes,
            Low: "-",
            Lowmod: "not available",
            Lmmi: "",
            Lowmoduniv: null,
            Lowmod_pct: null,
          },
        },
      ],
      source,
    );

    expect(metrics[0]).toMatchObject({
      lowPersons: null,
      lowModPersons: null,
      lowModerateMiddleIncomePersons: null,
      lowModUniverse: null,
      lowModPct: null,
    });
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      aggregateHudLowModerateIncomeBlockGroups(
        [{ attributes: { State: "06", County: "001", GEOID: "060014043002" } }],
        source,
      ),
    ).toThrow("missing field: Source");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudLowModerateIncomeBlockGroups(source)).rejects.toThrow(
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

    await expect(ingestHudLowModerateIncomeBlockGroups(source)).rejects.toThrow(
      "HUD low/moderate income block groups request failed: 503",
    );
  });

  it("downloads, paginates, aggregates, and imports county rows", async () => {
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

    const result = await ingestHudLowModerateIncomeBlockGroups({
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

    await expect(ingestHudLowModerateIncomeBlockGroups(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
