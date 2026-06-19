import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHouseholdIncomeUrl,
  CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES,
  ingestCensusAcsHouseholdIncome,
  mapCensusAcsHouseholdIncomeRow,
  parseCensusAcsHouseholdIncomeResponse,
} from "@/lib/sources/census-acs-household-income";

const source = {
  sourceId: "census_acs_household_income_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1000",
  "50",
  "5.0",
  "25",
  "2.5",
  "75",
  "7.5",
  "80",
  "8.0",
  "100",
  "10.0",
  "140",
  "14.0",
  "130",
  "13.0",
  "170",
  "17.0",
  "110",
  "11.0",
  "120",
  "12.0",
  "132000",
  "185000",
  "06",
  "001",
];

describe("Census ACS household income source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHouseholdIncomeUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP03_0051E");
    expect(url.searchParams.get("get")).toContain("DP03_0063E");
  });

  it("maps aggregate DP03 rows to household income metrics", () => {
    const metric = mapCensusAcsHouseholdIncomeRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_household_income_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalHouseholds: 1000,
      incomeUnder10k: 50,
      incomeUnder10kPct: 5,
      income35kTo49999: 100,
      income35kTo49999Pct: 10,
      income100kTo149999: 170,
      income100kTo149999Pct: 17,
      income150kTo199999: 110,
      income200kPlus: 120,
      medianHouseholdIncome: 132000,
      meanHouseholdIncome: 185000,
      incomeUnder50k: 330,
      incomeUnder50kPct: 33,
      income100kPlus: 400,
      income100kPlusPct: 40,
      income150kPlus: 230,
      income150kPlusPct: 23,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null while deriving available rollups", () => {
    const suppressedRow = [...row];
    suppressedRow[16] = "-";
    suppressedRow[17] = "***";

    const metric = mapCensusAcsHouseholdIncomeRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.income100kTo149999).toBeNull();
    expect(metric.income100kTo149999Pct).toBeNull();
    expect(metric.income100kPlus).toBe(230);
    expect(metric.income100kPlusPct).toBe(23);
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHouseholdIncomeResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsHouseholdIncomeResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsHouseholdIncomeRow(
        header.filter((field) => field !== "DP03_0051E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP03_0051E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHouseholdIncome({
        ...source,
        sourceName: "ACS Household Income",
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
      ingestCensusAcsHouseholdIncome({
        ...source,
        sourceName: "ACS Household Income",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS household income request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsHouseholdIncome({
        ...source,
        sourceName: "ACS Household Income",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
