import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHousingUrl,
  CENSUS_ACS_HOUSING_VARIABLES,
  ingestCensusAcsHousing,
  mapCensusAcsHousingRow,
  parseCensusAcsHousingResponse,
} from "@/lib/sources/census-acs-housing";

const source = {
  sourceId: "census_acs_2024_bay_area_housing",
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
  CENSUS_ACS_HOUSING_VARIABLES.totalHousingUnits,
  CENSUS_ACS_HOUSING_VARIABLES.occupiedHousingUnits,
  CENSUS_ACS_HOUSING_VARIABLES.vacantHousingUnits,
  CENSUS_ACS_HOUSING_VARIABLES.occupiedHousingPct,
  CENSUS_ACS_HOUSING_VARIABLES.vacantHousingPct,
  CENSUS_ACS_HOUSING_VARIABLES.homeownerVacancyRate,
  CENSUS_ACS_HOUSING_VARIABLES.rentalVacancyRate,
  CENSUS_ACS_HOUSING_VARIABLES.ownerOccupiedUnits,
  CENSUS_ACS_HOUSING_VARIABLES.renterOccupiedUnits,
  CENSUS_ACS_HOUSING_VARIABLES.ownerOccupiedPct,
  CENSUS_ACS_HOUSING_VARIABLES.renterOccupiedPct,
  CENSUS_ACS_HOUSING_VARIABLES.medianHomeValue,
  CENSUS_ACS_HOUSING_VARIABLES.medianGrossRent,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "640000",
  "600000",
  "40000",
  "93.8",
  "6.2",
  "0.7",
  "4.5",
  "320000",
  "280000",
  "53.3",
  "46.7",
  "1200000",
  "2400",
  "06",
  "001",
];

describe("Census ACS housing stock source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS housing URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHousingUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP04_0001E");
    expect(url.searchParams.get("get")).toContain("DP04_0134E");
  });

  it("maps aggregate DP04 rows to housing stock metrics", () => {
    const metric = mapCensusAcsHousingRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_2024_bay_area_housing",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalHousingUnits: 640000,
      occupiedHousingUnits: 600000,
      vacantHousingUnits: 40000,
      occupiedHousingPct: 93.8,
      vacantHousingPct: 6.2,
      homeownerVacancyRate: 0.7,
      rentalVacancyRate: 4.5,
      ownerOccupiedUnits: 320000,
      renterOccupiedUnits: 280000,
      ownerOccupiedPct: 53.3,
      renterOccupiedPct: 46.7,
      medianHomeValue: 1200000,
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
    suppressedRow[1] = "-";
    suppressedRow[13] = "***";

    const metric = mapCensusAcsHousingRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.totalHousingUnits).toBeNull();
    expect(metric.medianGrossRent).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHousingResponse([header, row], source, county);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() => parseCensusAcsHousingResponse([header], source, county)).toThrow(
      "did not include data rows",
    );

    expect(() =>
      mapCensusAcsHousingRow(
        header.filter((field) => field !== "DP04_0001E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP04_0001E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHousing({
        ...source,
        sourceName: "ACS Housing",
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
      ingestCensusAcsHousing({
        ...source,
        sourceName: "ACS Housing",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS housing request failed: 503");
  });
});
