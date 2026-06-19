import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHousingStructureUrl,
  CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES,
  ingestCensusAcsHousingStructure,
  mapCensusAcsHousingStructureRow,
  parseCensusAcsHousingStructureResponse,
} from "@/lib/sources/census-acs-housing-structure";

const source = {
  sourceId: "census_acs_housing_structure_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1000",
  "400",
  "40.0",
  "100",
  "10.0",
  "20",
  "2.0",
  "30",
  "3.0",
  "50",
  "5.0",
  "150",
  "15.0",
  "200",
  "20.0",
  "45",
  "4.5",
  "5",
  "0.5",
  "30",
  "3.0",
  "70",
  "7.0",
  "120",
  "12.0",
  "130",
  "13.0",
  "140",
  "14.0",
  "150",
  "15.0",
  "160",
  "16.0",
  "100",
  "10.0",
  "80",
  "8.0",
  "90",
  "9.0",
  "06",
  "001",
];

describe("Census ACS housing structure source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHousingStructureUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP04_0006E");
    expect(url.searchParams.get("get")).toContain("DP04_0026PE");
  });

  it("maps aggregate DP04 rows to housing structure metrics", () => {
    const metric = mapCensusAcsHousingStructureRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_housing_structure_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalHousingUnits: 1000,
      oneUnitDetached: 400,
      oneUnitDetachedPct: 40,
      oneUnitAttached: 100,
      oneUnitAttachedPct: 10,
      twentyPlusUnits: 200,
      twentyPlusUnitsPct: 20,
      mobileHomeUnits: 45,
      boatRvVanUnits: 5,
      built2020OrLater: 30,
      built2010To2019: 70,
      built1939OrEarlier: 90,
      singleFamilyUnits: 500,
      singleFamilyUnitsPct: 50,
      smallMultifamilyUnits: 100,
      smallMultifamilyUnitsPct: 10,
      largeMultifamilyUnits: 350,
      largeMultifamilyUnitsPct: 35,
      built2010OrLater: 100,
      built2010OrLaterPct: 10,
      builtBefore1960: 270,
      builtBefore1960Pct: 27,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null while deriving available rollups", () => {
    const suppressedRow = [...row];
    suppressedRow[1] = "-";
    suppressedRow[2] = "***";
    suppressedRow[3] = "***";

    const metric = mapCensusAcsHousingStructureRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.totalHousingUnits).toBeNull();
    expect(metric.oneUnitDetached).toBeNull();
    expect(metric.singleFamilyUnits).toBe(100);
    expect(metric.singleFamilyUnitsPct).toBe(10);
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHousingStructureResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsHousingStructureResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsHousingStructureRow(
        header.filter((field) => field !== "DP04_0006E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP04_0006E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHousingStructure({
        ...source,
        sourceName: "ACS Housing Structure",
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
      ingestCensusAcsHousingStructure({
        ...source,
        sourceName: "ACS Housing Structure",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS housing structure request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsHousingStructure({
        ...source,
        sourceName: "ACS Housing Structure",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
