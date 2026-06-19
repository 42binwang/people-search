import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHousingCrowdingUrl,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES,
  ingestCensusAcsHousingCrowding,
  mapCensusAcsHousingCrowdingRow,
  parseCensusAcsHousingCrowdingResponse,
} from "@/lib/sources/census-acs-housing-crowding";

const source = {
  sourceId: "census_acs_crowding_2024_bay_area",
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
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupiedHousingUnits,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOneOrLess,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOneOrLessPct,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOneToOnePointFive,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOneToOnePointFivePct,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOnePointFivePlus,
  CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOnePointFivePlusPct,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "600000",
  "560000",
  "93.3",
  "30000",
  "5.0",
  "10000",
  "1.7",
  "06",
  "001",
];

describe("Census ACS housing crowding source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHousingCrowdingUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP04_0076E");
    expect(url.searchParams.get("get")).toContain("DP04_0079PE");
  });

  it("maps aggregate DP04 rows to housing crowding metrics", () => {
    const metric = mapCensusAcsHousingCrowdingRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_crowding_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      occupiedHousingUnits: 600000,
      occupantsPerRoomOneOrLess: 560000,
      occupantsPerRoomOneOrLessPct: 93.3,
      occupantsPerRoomOneToOnePointFive: 30000,
      occupantsPerRoomOneToOnePointFivePct: 5,
      occupantsPerRoomOnePointFivePlus: 10000,
      occupantsPerRoomOnePointFivePlusPct: 1.7,
      overcrowdedUnits: 40000,
      overcrowdedPct: 6.7,
      severeOvercrowdedUnits: 10000,
      severeOvercrowdedPct: 1.7,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null while deriving available crowding totals", () => {
    const suppressedRow = [...row];
    suppressedRow[1] = "-";
    suppressedRow[6] = "***";
    suppressedRow[7] = "***";

    const metric = mapCensusAcsHousingCrowdingRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.occupiedHousingUnits).toBeNull();
    expect(metric.overcrowdedUnits).toBe(30000);
    expect(metric.overcrowdedPct).toBe(5);
    expect(metric.severeOvercrowdedUnits).toBeNull();
    expect(metric.severeOvercrowdedPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHousingCrowdingResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsHousingCrowdingResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsHousingCrowdingRow(
        header.filter((field) => field !== "DP04_0076E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP04_0076E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHousingCrowding({
        ...source,
        sourceName: "ACS Housing Crowding",
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
      ingestCensusAcsHousingCrowding({
        ...source,
        sourceName: "ACS Housing Crowding",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS housing crowding request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsHousingCrowding({
        ...source,
        sourceName: "ACS Housing Crowding",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
