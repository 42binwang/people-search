import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsResidentialTenureUrl,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES,
  ingestCensusAcsResidentialTenure,
  mapCensusAcsResidentialTenureRow,
  parseCensusAcsResidentialTenureResponse,
} from "@/lib/sources/census-acs-residential-tenure";

const source = {
  sourceId: "census_acs_residential_tenure_2024_bay_area",
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
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.occupiedHousingUnits,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2023OrLater,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2023OrLaterPct,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2020To2022,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2020To2022Pct,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2010To2019,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2010To2019Pct,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2000To2009,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2000To2009Pct,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1990To1999,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1990To1999Pct,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1989OrEarlier,
  CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1989OrEarlierPct,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "600000",
  "45000",
  "7.5",
  "150000",
  "25.0",
  "240000",
  "40.0",
  "90000",
  "15.0",
  "45000",
  "7.5",
  "30000",
  "5.0",
  "06",
  "001",
];

describe("Census ACS residential tenure source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS residential tenure URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsResidentialTenureUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP04_0050E");
    expect(url.searchParams.get("get")).toContain("DP04_0056PE");
  });

  it("maps aggregate DP04 rows to residential tenure metrics", () => {
    const metric = mapCensusAcsResidentialTenureRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_residential_tenure_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      occupiedHousingUnits: 600000,
      moved2023OrLater: 45000,
      moved2023OrLaterPct: 7.5,
      moved2020To2022: 150000,
      moved2020To2022Pct: 25,
      moved2010To2019: 240000,
      moved2010To2019Pct: 40,
      moved2000To2009: 90000,
      moved2000To2009Pct: 15,
      moved1990To1999: 45000,
      moved1990To1999Pct: 7.5,
      moved1989OrEarlier: 30000,
      moved1989OrEarlierPct: 5,
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
    suppressedRow[13] = "***";

    const metric = mapCensusAcsResidentialTenureRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.occupiedHousingUnits).toBeNull();
    expect(metric.moved1989OrEarlierPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsResidentialTenureResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsResidentialTenureResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsResidentialTenureRow(
        header.filter((field) => field !== "DP04_0050E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP04_0050E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsResidentialTenure({
        ...source,
        sourceName: "ACS Residential Tenure",
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
      ingestCensusAcsResidentialTenure({
        ...source,
        sourceName: "ACS Residential Tenure",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS residential tenure request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsResidentialTenure({
        ...source,
        sourceName: "ACS Residential Tenure",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
