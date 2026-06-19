import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateHudDifficultDevelopmentAreas,
  buildHudDifficultDevelopmentAreasUrl,
  ingestHudDifficultDevelopmentAreas,
} from "@/lib/sources/hud-difficult-development-areas";

const source = {
  sourceId: "hud_dda_2026_bay_area_fmr_areas",
  sourceName: "HUD Difficult Development Areas 2026 - Bay Area FMR Area Counts",
  hub: "Bay Area",
  fiscalYear: 2026,
  layerUrl:
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/DIFFICULT_DEVELOPMENT_AREAS_2026/FeatureServer/0",
  areas: [
    {
      label: "Oakland-Fremont, CA HUD Metro FMR Area",
      name: "Oakland-Fremont, CA HUD Metro FMR Area",
    },
    {
      label: "San Francisco, CA HUD Metro FMR Area",
      name: "San Francisco, CA HUD Metro FMR Area",
    },
  ],
};

const oaklandFeature = {
  attributes: {
    ZCTA5: "94513",
    DDA_CODE: "METRO41860MM5775",
    DDA_TYPE: "SA",
    DDA_NAME: "Oakland-Fremont, CA HUD Metro FMR Area",
  },
};

describe("HUD difficult development areas source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds ArcGIS query URLs for FMR-area aggregates and non-address fields only", () => {
    const url = new URL(
      buildHudDifficultDevelopmentAreasUrl(source, {
        offset: 2000,
        pageSize: 1000,
      }),
    );

    expect(url.pathname).toBe(
      "/VTyQ9soqVukalItT/arcgis/rest/services/DIFFICULT_DEVELOPMENT_AREAS_2026/FeatureServer/0/query",
    );
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.get("returnGeometry")).toBe("false");
    expect(url.searchParams.get("where")).toBe(
      "DDA_NAME IN ('Oakland-Fremont, CA HUD Metro FMR Area','San Francisco, CA HUD Metro FMR Area')",
    );
    expect(url.searchParams.get("outFields")).toBe(
      "ZCTA5,DDA_CODE,DDA_TYPE,DDA_NAME",
    );
    expect(url.searchParams.get("resultOffset")).toBe("2000");
    expect(url.searchParams.get("resultRecordCount")).toBe("1000");
    expect(url.searchParams.toString()).not.toContain("OWNER");
    expect(url.searchParams.toString()).not.toContain("ADDRESS");
    expect(url.searchParams.toString()).not.toContain("TENANT");
    expect(url.searchParams.toString()).not.toContain("PARTICIPANT");
    expect(url.searchParams.toString()).not.toContain("Shape__Area");
    expect(url.searchParams.toString()).not.toContain("Shape__Length");
  });

  it("aggregates qualifying ZCTA rows into HUD area metrics", () => {
    const metrics = aggregateHudDifficultDevelopmentAreas(
      [
        oaklandFeature,
        {
          attributes: {
            ...oaklandFeature.attributes,
            ZCTA5: "94517",
          },
        },
        {
          attributes: {
            ...oaklandFeature.attributes,
            ZCTA5: "94517",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      sourceId: "hud_dda_2026_bay_area_fmr_areas",
      sourceRecordId: "2026-metro41860mm5775",
      hub: "Bay Area",
      fiscalYear: 2026,
      areaName: "Oakland-Fremont, CA HUD Metro FMR Area",
      ddaCode: "METRO41860MM5775",
      ddaType: "SA",
      zctaCount: 2,
      raw: {
        zctas: ["94513", "94517"],
        fieldPolicy:
          "HUD DDA aggregate counts from ZCTA identifiers by HUD FMR/MSA label.",
      },
    });
  });

  it("filters non-target areas before aggregation", () => {
    const metrics = aggregateHudDifficultDevelopmentAreas(
      [
        oaklandFeature,
        {
          attributes: {
            ...oaklandFeature.attributes,
            ZCTA5: "95041",
            DDA_CODE: "METRO42100M42100",
            DDA_NAME: "Santa Cruz-Watsonville, CA MSA",
          },
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].areaName).toBe(
      "Oakland-Fremont, CA HUD Metro FMR Area",
    );
  });

  it("throws explicit errors for malformed ArcGIS payloads and missing fields", async () => {
    expect(() =>
      aggregateHudDifficultDevelopmentAreas(
        [{ attributes: { ZCTA5: "94513", DDA_NAME: source.areas[0].name } }],
        source,
      ),
    ).toThrow("missing field: DDA_CODE");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "bad where clause" } })),
    );

    await expect(ingestHudDifficultDevelopmentAreas(source)).rejects.toThrow(
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

    await expect(ingestHudDifficultDevelopmentAreas(source)).rejects.toThrow(
      "HUD difficult development areas request failed: 503",
    );
  });

  it("downloads, paginates, aggregates, and imports HUD area rows", async () => {
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

    const result = await ingestHudDifficultDevelopmentAreas({
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

    await expect(ingestHudDifficultDevelopmentAreas(source)).rejects.toThrow(
      "not valid JSON",
    );
  });
});
