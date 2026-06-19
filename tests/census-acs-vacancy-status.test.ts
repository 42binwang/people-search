import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsVacancyStatusUrl,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES,
  ingestCensusAcsVacancyStatus,
  mapCensusAcsVacancyStatusRow,
  parseCensusAcsVacancyStatusResponse,
} from "@/lib/sources/census-acs-vacancy-status";

const source = {
  sourceId: "census_acs_vacancy_status_2024_bay_area",
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
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.totalVacantUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.forRentUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.rentedNotOccupiedUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.forSaleOnlyUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.soldNotOccupiedUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.seasonalRecreationalOccasionalUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.migrantWorkerUnits,
  CENSUS_ACS_VACANCY_STATUS_VARIABLES.otherVacantUnits,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "40000",
  "12000",
  "2000",
  "5000",
  "1000",
  "8000",
  "400",
  "11600",
  "06",
  "001",
];

describe("Census ACS vacancy status source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS detailed-table URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsVacancyStatusUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("B25004_001E");
    expect(url.searchParams.get("get")).toContain("B25004_008E");
  });

  it("maps aggregate B25004 rows to vacancy status metrics", () => {
    const metric = mapCensusAcsVacancyStatusRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_vacancy_status_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalVacantUnits: 40000,
      forRentUnits: 12000,
      forRentPct: 30,
      rentedNotOccupiedUnits: 2000,
      rentedNotOccupiedPct: 5,
      forSaleOnlyUnits: 5000,
      forSaleOnlyPct: 12.5,
      soldNotOccupiedUnits: 1000,
      soldNotOccupiedPct: 2.5,
      seasonalRecreationalOccasionalUnits: 8000,
      seasonalRecreationalOccasionalPct: 20,
      migrantWorkerUnits: 400,
      migrantWorkerPct: 1,
      otherVacantUnits: 11600,
      otherVacantPct: 29,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("stores suppressed values and derived percentages as null when needed", () => {
    const suppressedRow = [...row];
    suppressedRow[1] = "-";
    suppressedRow[2] = "***";

    const metric = mapCensusAcsVacancyStatusRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.totalVacantUnits).toBeNull();
    expect(metric.forRentUnits).toBeNull();
    expect(metric.forRentPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsVacancyStatusResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsVacancyStatusResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsVacancyStatusRow(
        header.filter((field) => field !== "B25004_001E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: B25004_001E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsVacancyStatus({
        ...source,
        sourceName: "ACS Vacancy Status",
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
      ingestCensusAcsVacancyStatus({
        ...source,
        sourceName: "ACS Vacancy Status",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS vacancy status request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsVacancyStatus({
        ...source,
        sourceName: "ACS Vacancy Status",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
