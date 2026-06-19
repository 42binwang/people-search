import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsValueRentUrl,
  CENSUS_ACS_VALUE_RENT_VARIABLES,
  ingestCensusAcsValueRent,
  mapCensusAcsValueRentRow,
  parseCensusAcsValueRentResponse,
} from "@/lib/sources/census-acs-value-rent";

const source = {
  sourceId: "census_acs_value_rent_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_VALUE_RENT_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1000",
  "5",
  "0.5",
  "10",
  "1.0",
  "15",
  "1.5",
  "20",
  "2.0",
  "50",
  "5.0",
  "150",
  "15.0",
  "300",
  "30.0",
  "450",
  "45.0",
  "1250000",
  "800",
  "5",
  "0.6",
  "20",
  "2.5",
  "80",
  "10.0",
  "160",
  "20.0",
  "200",
  "25.0",
  "150",
  "18.8",
  "185",
  "23.1",
  "3100",
  "12",
  "1.5",
  "06",
  "001",
];

describe("Census ACS value/rent source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsValueRentUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP04_0080E");
    expect(url.searchParams.get("get")).toContain("DP04_0135PE");
  });

  it("maps aggregate DP04 rows to value and rent distribution metrics", () => {
    const metric = mapCensusAcsValueRentRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_value_rent_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      ownerValueUnits: 1000,
      valueUnder50k: 5,
      value500kTo999999: 300,
      value500kTo999999Pct: 30,
      value1mPlus: 450,
      value1mPlusPct: 45,
      medianHomeValue: 1250000,
      rentPayingUnits: 800,
      rent1500To1999: 160,
      rent2000To2499: 200,
      rent2500To2999: 150,
      rent2500To2999Pct: 18.8,
      rent3000Plus: 185,
      rent3000PlusPct: 23.1,
      medianGrossRent: 3100,
      noRentPaid: 12,
      value500kPlus: 750,
      value500kPlusPct: 75,
      rent2500Plus: 335,
      rent2500PlusPct: 41.9,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null while deriving available rollups", () => {
    const suppressedRow = [...row];
    suppressedRow[14] = "-";
    suppressedRow[15] = "***";

    const metric = mapCensusAcsValueRentRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.value500kTo999999).toBeNull();
    expect(metric.value500kTo999999Pct).toBeNull();
    expect(metric.value500kPlus).toBe(450);
    expect(metric.value500kPlusPct).toBe(45);
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsValueRentResponse([header, row], source, county);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsValueRentResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsValueRentRow(
        header.filter((field) => field !== "DP04_0080E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP04_0080E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsValueRent({
        ...source,
        sourceName: "ACS Value Rent",
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
      ingestCensusAcsValueRent({
        ...source,
        sourceName: "ACS Value Rent",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS value/rent request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsValueRent({
        ...source,
        sourceName: "ACS Value Rent",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
