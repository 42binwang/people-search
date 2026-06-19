import { describe, expect, it } from "vitest";
import {
  buildCensusAcsMobilityUrl,
  CENSUS_ACS_MOBILITY_VARIABLES,
  mapCensusAcsMobilityRow,
  parseCensusAcsMobilityResponse,
} from "@/lib/sources/census-acs-mobility";

const source = {
  sourceId: "census_acs_2024_bay_area_mobility",
  hub: "Bay Area",
  year: 2024,
};

const geography = {
  label: "Alameda County, California",
  state: "6",
  county: "1",
};

const header = [
  "NAME",
  CENSUS_ACS_MOBILITY_VARIABLES.totalPopulationOneYearOver,
  CENSUS_ACS_MOBILITY_VARIABLES.sameHouse,
  CENSUS_ACS_MOBILITY_VARIABLES.differentHouse,
  CENSUS_ACS_MOBILITY_VARIABLES.differentHouseUs,
  CENSUS_ACS_MOBILITY_VARIABLES.movedWithinSameCounty,
  CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentCounty,
  CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentCountySameState,
  CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentState,
  CENSUS_ACS_MOBILITY_VARIABLES.movedFromAbroad,
  CENSUS_ACS_MOBILITY_VARIABLES.sameHousePct,
  CENSUS_ACS_MOBILITY_VARIABLES.differentHousePct,
  CENSUS_ACS_MOBILITY_VARIABLES.movedWithinSameCountyPct,
  CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentCountySameStatePct,
  CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentStatePct,
  CENSUS_ACS_MOBILITY_VARIABLES.movedFromAbroadPct,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1650000",
  "1419000",
  "231000",
  "226000",
  "151000",
  "75000",
  "42000",
  "33000",
  "5000",
  "86.0",
  "14.0",
  "9.2",
  "2.5",
  "2.0",
  "0.3",
  "06",
  "001",
];

describe("Census ACS mobility source mapping", () => {
  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsMobilityUrl({
        year: 2024,
        geography,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP02_0080E");
  });

  it("maps aggregate residence-one-year-ago rows to mobility metrics", () => {
    const metric = mapCensusAcsMobilityRow(header, row, source, geography);

    expect(metric).toMatchObject({
      sourceId: "census_acs_2024_bay_area_mobility",
      sourceRecordId: "2024-06001",
      year: 2024,
      geographyLevel: "county",
      geoId: "06001",
      name: "Alameda County, California",
      hub: "Bay Area",
      state: "06",
      county: "001",
      totalPopulationOneYearOver: 1650000,
      sameHouse: 1419000,
      differentHouse: 231000,
      movedWithinSameCounty: 151000,
      movedDifferentCountySameState: 42000,
      movedDifferentState: 33000,
      movedFromAbroad: 5000,
      sameHousePct: 86,
      differentHousePct: 14,
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
    suppressedRow[10] = "***";

    const metric = mapCensusAcsMobilityRow(
      header,
      suppressedRow,
      source,
      geography,
    );

    expect(metric.totalPopulationOneYearOver).toBeNull();
    expect(metric.sameHousePct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsMobilityResponse(
      [header, row],
      source,
      geography,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].geoId).toBe("06001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsMobilityResponse([header], source, geography),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsMobilityRow(
        header.filter((field) => field !== "DP02_0080E"),
        row,
        source,
        geography,
      ),
    ).toThrow("missing field: DP02_0080E");
  });
});
