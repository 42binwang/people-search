import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsPovertyAssistanceUrl,
  CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES,
  ingestCensusAcsPovertyAssistance,
  mapCensusAcsPovertyAssistanceRow,
  parseCensusAcsPovertyAssistanceResponse,
} from "@/lib/sources/census-acs-poverty-assistance";

const source = {
  sourceId: "census_acs_poverty_assistance_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "26000",
  "4.0",
  "4200",
  "56000",
  "8.5",
  "25000",
  "6.8",
  "12000",
  "9.2",
  "9000",
  "19.5",
  "78000",
  "10.0",
  "25000",
  "12.2",
  "43000",
  "9.1",
  "10000",
  "8.8",
  "06",
  "001",
];

describe("Census ACS poverty and assistance source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsPovertyAssistanceUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP03_0072E");
    expect(url.searchParams.get("get")).toContain("DP03_0135PE");
  });

  it("maps aggregate DP03 rows to poverty and assistance metrics", () => {
    const metric = mapCensusAcsPovertyAssistanceRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_poverty_assistance_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      cashPublicAssistanceHouseholds: 26000,
      cashPublicAssistanceHouseholdsPct: 4,
      meanCashPublicAssistanceIncome: 4200,
      snapHouseholds: 56000,
      snapHouseholdsPct: 8.5,
      familiesBelowPoverty: 25000,
      familiesBelowPovertyPct: 6.8,
      familiesWithChildrenBelowPoverty: 12000,
      familiesWithChildrenBelowPovertyPct: 9.2,
      femaleHouseholderFamiliesBelowPoverty: 9000,
      femaleHouseholderFamiliesBelowPovertyPct: 19.5,
      peopleBelowPoverty: 78000,
      peopleBelowPovertyPct: 10,
      childrenBelowPoverty: 25000,
      childrenBelowPovertyPct: 12.2,
      adults18To64BelowPoverty: 43000,
      adults18To64BelowPovertyPct: 9.1,
      adults65PlusBelowPoverty: 10000,
      adults65PlusBelowPovertyPct: 8.8,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[4] = "-";
    suppressedRow[5] = "***";

    const metric = mapCensusAcsPovertyAssistanceRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.snapHouseholds).toBeNull();
    expect(metric.snapHouseholdsPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsPovertyAssistanceResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsPovertyAssistanceResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsPovertyAssistanceRow(
        header.filter((field) => field !== "DP03_0072E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP03_0072E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsPovertyAssistance({
        ...source,
        sourceName: "ACS Poverty and Assistance",
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
      ingestCensusAcsPovertyAssistance({
        ...source,
        sourceName: "ACS Poverty and Assistance",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS poverty and assistance request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsPovertyAssistance({
        ...source,
        sourceName: "ACS Poverty and Assistance",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
