import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBlsLausCountyLaborRequest,
  buildBlsLausCountySeriesIds,
  ingestBlsLausCountyLabor,
  mapBlsLausCountyLaborSeries,
  parseBlsLausCountyLaborResponse,
} from "@/lib/sources/bls-laus-county-labor";

const source = {
  sourceId: "bls_laus_county_labor_2024_2026_bay_area",
  hub: "Bay Area",
};

const county = {
  label: "Alameda County, California",
  state: "6",
  county: "1",
};

const seriesIds = buildBlsLausCountySeriesIds(county);

function series(
  seriesID: string,
  value: string,
  period = "M12",
  periodName = "December",
) {
  return {
    seriesID,
    data: [
      {
        year: "2024",
        period,
        periodName,
        value,
        footnotes: [{ code: "T", text: "Data were subject to revision." }],
      },
    ],
  };
}

describe("BLS LAUS county labor source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BLS_API_KEY;
  });

  it("builds LAUS county series IDs with normalized FIPS codes", () => {
    expect(seriesIds).toEqual({
      unemploymentRate: "LAUCN060010000000003",
      unemployment: "LAUCN060010000000004",
      employment: "LAUCN060010000000005",
      laborForce: "LAUCN060010000000006",
    });
  });

  it("builds BLS request bodies without requiring an API key", () => {
    const request = buildBlsLausCountyLaborRequest(
      {
        startYear: 2024,
        endYear: 2026,
        endpointUrl: "https://example.test/bls",
      },
      county,
    );
    const body = JSON.parse(request.body) as Record<string, unknown>;

    expect(request.url).toBe("https://example.test/bls");
    expect(body.startyear).toBe("2024");
    expect(body.endyear).toBe("2026");
    expect(body.seriesid).toEqual(Object.values(seriesIds));
    expect(body.registrationkey).toBeUndefined();
  });

  it("adds a BLS registration key when configured", () => {
    const request = buildBlsLausCountyLaborRequest(
      {
        startYear: 2024,
        endYear: 2024,
        apiKey: "test-key",
      },
      county,
    );
    const body = JSON.parse(request.body) as Record<string, unknown>;

    expect(body.registrationkey).toBe("test-key");
  });

  it("maps four LAUS series into one county-month labor metric", () => {
    const metrics = mapBlsLausCountyLaborSeries(
      [
        series(seriesIds.unemploymentRate, "4.3"),
        series(seriesIds.unemployment, "37286"),
        series(seriesIds.employment, "838190"),
        series(seriesIds.laborForce, "875476"),
      ],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      sourceId: "bls_laus_county_labor_2024_2026_bay_area",
      sourceRecordId: "2024-06001-M12",
      hub: "Bay Area",
      year: 2024,
      period: "M12",
      periodName: "December",
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      laborForce: 875476,
      employment: 838190,
      unemployment: 37286,
      unemploymentRate: 4.3,
    });
    expect(metrics[0].raw).toMatchObject({ seriesIds });
  });

  it("ignores annual M13 rows and unknown series", () => {
    const metrics = mapBlsLausCountyLaborSeries(
      [
        series(seriesIds.unemploymentRate, "4.3", "M13", "Annual"),
        series("LAUCN060010000000099", "1.2"),
      ],
      source,
      county,
    );

    expect(metrics).toHaveLength(0);
  });

  it("parses successful BLS payloads and rejects failed payloads", () => {
    expect(
      parseBlsLausCountyLaborResponse(
        {
          status: "REQUEST_SUCCEEDED",
          Results: {
            series: [series(seriesIds.unemploymentRate, "4.3")],
          },
        },
        source,
        county,
      ),
    ).toHaveLength(1);

    expect(() =>
      parseBlsLausCountyLaborResponse(
        { status: "REQUEST_NOT_PROCESSED", message: ["bad request"] },
        source,
        county,
      ),
    ).toThrow("was not successful");
  });

  it("surfaces failed BLS downloads before importing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      ingestBlsLausCountyLabor({
        ...source,
        sourceName: "BLS LAUS",
        startYear: 2024,
        endYear: 2024,
        counties: [county],
      }),
    ).rejects.toThrow("BLS LAUS county labor request failed: 503");
  });

  it("throws explicit errors for non-JSON BLS responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestBlsLausCountyLabor({
        ...source,
        sourceName: "BLS LAUS",
        startYear: 2024,
        endYear: 2024,
        counties: [county],
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
