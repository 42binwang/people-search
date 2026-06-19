import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsEmploymentStatusUrl,
  CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES,
  ingestCensusAcsEmploymentStatus,
  mapCensusAcsEmploymentStatusRow,
  parseCensusAcsEmploymentStatusResponse,
} from "@/lib/sources/census-acs-employment-status";

const source = {
  sourceId: "census_acs_employment_status_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1300000",
  "880000",
  "67.7",
  "878000",
  "67.5",
  "840000",
  "64.6",
  "38000",
  "2.9",
  "2000",
  "0.2",
  "420000",
  "32.3",
  "4.3",
  "06",
  "001",
];

describe("Census ACS employment status source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsEmploymentStatusUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP03_0001E");
    expect(url.searchParams.get("get")).toContain("DP03_0009PE");
  });

  it("maps aggregate DP03 rows to employment status metrics", () => {
    const metric = mapCensusAcsEmploymentStatusRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_employment_status_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      population16Plus: 1300000,
      inLaborForce: 880000,
      inLaborForcePct: 67.7,
      civilianLaborForce: 878000,
      civilianLaborForcePct: 67.5,
      employed: 840000,
      employedPct: 64.6,
      unemployed: 38000,
      unemployedPct: 2.9,
      armedForces: 2000,
      armedForcesPct: 0.2,
      notInLaborForce: 420000,
      notInLaborForcePct: 32.3,
      unemploymentRate: 4.3,
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

    const metric = mapCensusAcsEmploymentStatusRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.unemployed).toBeNull();
    expect(metric.unemployedPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsEmploymentStatusResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsEmploymentStatusResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsEmploymentStatusRow(
        header.filter((field) => field !== "DP03_0001E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP03_0001E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsEmploymentStatus({
        ...source,
        sourceName: "ACS Employment Status",
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
      ingestCensusAcsEmploymentStatus({
        ...source,
        sourceName: "ACS Employment Status",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS employment status request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsEmploymentStatus({
        ...source,
        sourceName: "ACS Employment Status",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
