import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsRaceOriginUrl,
  CENSUS_ACS_RACE_ORIGIN_VARIABLES,
  ingestCensusAcsRaceOrigin,
  mapCensusAcsRaceOriginRow,
  parseCensusAcsRaceOriginResponse,
} from "@/lib/sources/census-acs-race-origin";

const source = {
  sourceId: "census_acs_race_origin_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_RACE_ORIGIN_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1650000",
  "670000",
  "40.6",
  "190000",
  "11.5",
  "18000",
  "1.1",
  "520000",
  "31.5",
  "14000",
  "0.8",
  "90000",
  "5.5",
  "148000",
  "9.0",
  "380000",
  "23.0",
  "1270000",
  "77.0",
  "570000",
  "34.5",
  "06",
  "001",
];

describe("Census ACS race and origin source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsRaceOriginUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP05_0033E");
    expect(url.searchParams.get("get")).toContain("DP05_0096PE");
  });

  it("maps aggregate DP05 rows to race and origin metrics", () => {
    const metric = mapCensusAcsRaceOriginRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_race_origin_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      raceTotalPopulation: 1650000,
      white: 670000,
      whitePct: 40.6,
      black: 190000,
      blackPct: 11.5,
      americanIndianAlaskaNative: 18000,
      americanIndianAlaskaNativePct: 1.1,
      asian: 520000,
      asianPct: 31.5,
      nativeHawaiianPacificIslander: 14000,
      nativeHawaiianPacificIslanderPct: 0.8,
      someOtherRace: 90000,
      someOtherRacePct: 5.5,
      twoOrMoreRaces: 148000,
      twoOrMoreRacesPct: 9,
      hispanicLatino: 380000,
      hispanicLatinoPct: 23,
      notHispanicLatino: 1270000,
      notHispanicLatinoPct: 77,
      whiteNonHispanic: 570000,
      whiteNonHispanicPct: 34.5,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[12] = "-";
    suppressedRow[13] = "***";

    const metric = mapCensusAcsRaceOriginRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.someOtherRace).toBeNull();
    expect(metric.someOtherRacePct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsRaceOriginResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsRaceOriginResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsRaceOriginRow(
        header.filter((field) => field !== "DP05_0033E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP05_0033E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsRaceOrigin({
        ...source,
        sourceName: "ACS Race and Origin",
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
      ingestCensusAcsRaceOrigin({
        ...source,
        sourceName: "ACS Race and Origin",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS race and origin request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsRaceOrigin({
        ...source,
        sourceName: "ACS Race and Origin",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
