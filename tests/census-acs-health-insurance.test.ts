import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHealthInsuranceUrl,
  CENSUS_ACS_HEALTH_INSURANCE_VARIABLES,
  ingestCensusAcsHealthInsurance,
  mapCensusAcsHealthInsuranceRow,
  parseCensusAcsHealthInsuranceResponse,
} from "@/lib/sources/census-acs-health-insurance";

const source = {
  sourceId: "census_acs_health_insurance_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1600000",
  "1520000",
  "95.0",
  "1190000",
  "74.4",
  "520000",
  "32.5",
  "80000",
  "5.0",
  "340000",
  "9000",
  "2.6",
  "1040000",
  "31000",
  "4.1",
  "5000",
  "12.5",
  "18000",
  "11.0",
  "06",
  "001",
];

describe("Census ACS health insurance source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHealthInsuranceUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP03_0095E");
    expect(url.searchParams.get("get")).toContain("DP03_0118PE");
  });

  it("maps aggregate DP03 rows to health insurance metrics", () => {
    const metric = mapCensusAcsHealthInsuranceRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_health_insurance_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      civilianNoninstitutionalizedPopulation: 1600000,
      withHealthInsurance: 1520000,
      withHealthInsurancePct: 95,
      privateHealthInsurance: 1190000,
      privateHealthInsurancePct: 74.4,
      publicCoverage: 520000,
      publicCoveragePct: 32.5,
      noHealthInsurance: 80000,
      noHealthInsurancePct: 5,
      under19Population: 340000,
      under19NoHealthInsurance: 9000,
      under19NoHealthInsurancePct: 2.6,
      age19To64Population: 1040000,
      employedAge19To64NoHealthInsurance: 31000,
      employedAge19To64NoHealthInsurancePct: 4.1,
      unemployedAge19To64NoHealthInsurance: 5000,
      unemployedAge19To64NoHealthInsurancePct: 12.5,
      notInLaborForceAge19To64NoHealthInsurance: 18000,
      notInLaborForceAge19To64NoHealthInsurancePct: 11,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[8] = "-";
    suppressedRow[9] = "***";

    const metric = mapCensusAcsHealthInsuranceRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.noHealthInsurance).toBeNull();
    expect(metric.noHealthInsurancePct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHealthInsuranceResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsHealthInsuranceResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsHealthInsuranceRow(
        header.filter((field) => field !== "DP03_0095E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP03_0095E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHealthInsurance({
        ...source,
        sourceName: "ACS Health Insurance",
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
      ingestCensusAcsHealthInsurance({
        ...source,
        sourceName: "ACS Health Insurance",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS health insurance request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsHealthInsurance({
        ...source,
        sourceName: "ACS Health Insurance",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
