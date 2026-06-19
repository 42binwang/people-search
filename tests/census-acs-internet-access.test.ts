import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsInternetAccessUrl,
  CENSUS_ACS_INTERNET_ACCESS_VARIABLES,
  ingestCensusAcsInternetAccess,
  mapCensusAcsInternetAccessRow,
  parseCensusAcsInternetAccessResponse,
} from "@/lib/sources/census-acs-internet-access";

const source = {
  sourceId: "census_acs_internet_access_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_INTERNET_ACCESS_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "610000",
  "100.0",
  "585000",
  "95.9",
  "560000",
  "91.8",
  "06",
  "001",
];

describe("Census ACS internet access source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsInternetAccessUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP02_0152E");
    expect(url.searchParams.get("get")).toContain("DP02_0154PE");
  });

  it("maps aggregate DP02 rows to internet access metrics", () => {
    const metric = mapCensusAcsInternetAccessRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_internet_access_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalHouseholds: 610000,
      totalHouseholdsPct: 100,
      withComputer: 585000,
      withComputerPct: 95.9,
      withBroadband: 560000,
      withBroadbandPct: 91.8,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[5] = "-";
    suppressedRow[6] = "***";

    const metric = mapCensusAcsInternetAccessRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.withBroadband).toBeNull();
    expect(metric.withBroadbandPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsInternetAccessResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsInternetAccessResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsInternetAccessRow(
        header.filter((field) => field !== "DP02_0152E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP02_0152E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsInternetAccess({
        ...source,
        sourceName: "ACS Internet Access",
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
      ingestCensusAcsInternetAccess({
        ...source,
        sourceName: "ACS Internet Access",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS internet access request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsInternetAccess({
        ...source,
        sourceName: "ACS Internet Access",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
