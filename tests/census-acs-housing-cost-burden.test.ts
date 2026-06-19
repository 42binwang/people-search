import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHousingCostBurdenUrl,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES,
  ingestCensusAcsHousingCostBurden,
  mapCensusAcsHousingCostBurdenRow,
  parseCensusAcsHousingCostBurdenResponse,
} from "@/lib/sources/census-acs-housing-cost-burden";

const source = {
  sourceId: "census_acs_cost_burden_2024_bay_area",
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
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.medianOwnerCostWithMortgage,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.medianOwnerCostWithoutMortgage,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgageUnits,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage30To34,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage30To34Pct,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage35Plus,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage35PlusPct,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgageUnits,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage30To34,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage30To34Pct,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage35Plus,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage35PlusPct,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renterUnits,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.medianGrossRent,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter30To34,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter30To34Pct,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter35Plus,
  CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter35PlusPct,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "3200",
  "850",
  "250000",
  "30000",
  "12.0",
  "65000",
  "26.0",
  "70000",
  "4200",
  "6.0",
  "8400",
  "12.0",
  "280000",
  "2400",
  "42000",
  "15.0",
  "98000",
  "35.0",
  "06",
  "001",
];

describe("Census ACS housing cost burden source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS cost-burden URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHousingCostBurdenUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP04_0110E");
    expect(url.searchParams.get("get")).toContain("DP04_0142PE");
  });

  it("maps aggregate DP04 rows to housing cost burden metrics", () => {
    const metric = mapCensusAcsHousingCostBurdenRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_cost_burden_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      ownerMortgageUnits: 250000,
      ownerMortgage30To34Pct: 12,
      ownerMortgage35PlusPct: 26,
      ownerMortgage30Plus: 95000,
      ownerMortgage30PlusPct: 38,
      ownerNoMortgageUnits: 70000,
      ownerNoMortgage30To34Pct: 6,
      ownerNoMortgage35PlusPct: 12,
      ownerNoMortgage30Plus: 12600,
      ownerNoMortgage30PlusPct: 18,
      renterUnits: 280000,
      renter30To34Pct: 15,
      renter35PlusPct: 35,
      renter30Plus: 140000,
      renter30PlusPct: 50,
      medianOwnerCostWithMortgage: 3200,
      medianOwnerCostWithoutMortgage: 850,
      medianGrossRent: 2400,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("stores suppressed or unavailable Census values as null", () => {
    const suppressedRow = [...row];
    suppressedRow[3] = "-";
    suppressedRow[6] = "***";
    suppressedRow[7] = "***";

    const metric = mapCensusAcsHousingCostBurdenRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.ownerMortgageUnits).toBeNull();
    expect(metric.ownerMortgage30Plus).toBe(30000);
    expect(metric.ownerMortgage30PlusPct).toBe(12);
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHousingCostBurdenResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsHousingCostBurdenResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsHousingCostBurdenRow(
        header.filter((field) => field !== "DP04_0110E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP04_0110E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHousingCostBurden({
        ...source,
        sourceName: "ACS Housing Cost Burden",
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
      ingestCensusAcsHousingCostBurden({
        ...source,
        sourceName: "ACS Housing Cost Burden",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS housing cost burden request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsHousingCostBurden({
        ...source,
        sourceName: "ACS Housing Cost Burden",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
