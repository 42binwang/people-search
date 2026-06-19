import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsCommutingUrl,
  CENSUS_ACS_COMMUTING_VARIABLES,
  ingestCensusAcsCommuting,
  mapCensusAcsCommutingRow,
  parseCensusAcsCommutingResponse,
} from "@/lib/sources/census-acs-commuting";

const source = {
  sourceId: "census_acs_commuting_2024_bay_area",
  hub: "Bay Area",
  year: 2024,
};

const county = {
  label: "Alameda County, California",
  state: "6",
  county: "1",
};

const header = [
  "NAME",
  CENSUS_ACS_COMMUTING_VARIABLES.totalWorkers16Over,
  CENSUS_ACS_COMMUTING_VARIABLES.droveAlone,
  CENSUS_ACS_COMMUTING_VARIABLES.droveAlonePct,
  CENSUS_ACS_COMMUTING_VARIABLES.carpooled,
  CENSUS_ACS_COMMUTING_VARIABLES.carpooledPct,
  CENSUS_ACS_COMMUTING_VARIABLES.publicTransportation,
  CENSUS_ACS_COMMUTING_VARIABLES.publicTransportationPct,
  CENSUS_ACS_COMMUTING_VARIABLES.walked,
  CENSUS_ACS_COMMUTING_VARIABLES.walkedPct,
  CENSUS_ACS_COMMUTING_VARIABLES.otherMeans,
  CENSUS_ACS_COMMUTING_VARIABLES.otherMeansPct,
  CENSUS_ACS_COMMUTING_VARIABLES.workedFromHome,
  CENSUS_ACS_COMMUTING_VARIABLES.workedFromHomePct,
  CENSUS_ACS_COMMUTING_VARIABLES.meanTravelTimeMinutes,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "800000",
  "410000",
  "51.3",
  "65000",
  "8.1",
  "73000",
  "9.1",
  "30000",
  "3.8",
  "24000",
  "3.0",
  "198000",
  "24.8",
  "31.7",
  "06",
  "001",
];

describe("Census ACS commuting source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS commuting URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsCommutingUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP03_0018E");
    expect(url.searchParams.get("get")).toContain("DP03_0025E");
  });

  it("maps aggregate DP03 rows to commuting characteristic metrics", () => {
    const metric = mapCensusAcsCommutingRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_commuting_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalWorkers16Over: 800000,
      droveAlone: 410000,
      droveAlonePct: 51.3,
      carpooled: 65000,
      carpooledPct: 8.1,
      publicTransportation: 73000,
      publicTransportationPct: 9.1,
      walked: 30000,
      walkedPct: 3.8,
      otherMeans: 24000,
      otherMeansPct: 3,
      workedFromHome: 198000,
      workedFromHomePct: 24.8,
      meanTravelTimeMinutes: 31.7,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("stores suppressed or unavailable Census values as null", () => {
    const suppressedRow = [...row];
    suppressedRow[1] = "-";
    suppressedRow[14] = "***";

    const metric = mapCensusAcsCommutingRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.totalWorkers16Over).toBeNull();
    expect(metric.meanTravelTimeMinutes).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsCommutingResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsCommutingResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsCommutingRow(
        header.filter((field) => field !== "DP03_0018E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP03_0018E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsCommuting({
        ...source,
        sourceName: "ACS Commuting",
        counties: [county],
      }),
    ).rejects.toThrow("requires CENSUS_API_KEY");
  });

  it("surfaces failed Census downloads before importing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      ingestCensusAcsCommuting({
        ...source,
        sourceName: "ACS Commuting",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS commuting request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsCommuting({
        ...source,
        sourceName: "ACS Commuting",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
