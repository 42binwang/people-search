import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsAgeSexUrl,
  CENSUS_ACS_AGE_SEX_VARIABLES,
  ingestCensusAcsAgeSex,
  mapCensusAcsAgeSexRow,
  parseCensusAcsAgeSexResponse,
} from "@/lib/sources/census-acs-age-sex";

const source = {
  sourceId: "census_acs_age_sex_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_AGE_SEX_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1650000",
  "810000",
  "49.1",
  "840000",
  "50.9",
  "96.4",
  "85000",
  "5.2",
  "82000",
  "5.0",
  "80000",
  "4.8",
  "92000",
  "5.6",
  "105000",
  "6.4",
  "260000",
  "15.8",
  "245000",
  "14.8",
  "220000",
  "13.3",
  "105000",
  "6.4",
  "95000",
  "5.8",
  "170000",
  "10.3",
  "85000",
  "5.2",
  "26000",
  "1.6",
  "39.2",
  "06",
  "001",
];

describe("Census ACS age and sex source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsAgeSexUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP05_0001E");
    expect(url.searchParams.get("get")).toContain("DP05_0018E");
  });

  it("maps aggregate DP05 rows to age and sex metrics", () => {
    const metric = mapCensusAcsAgeSexRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_acs_age_sex_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalPopulation: 1650000,
      male: 810000,
      malePct: 49.1,
      female: 840000,
      femalePct: 50.9,
      sexRatio: 96.4,
      under5: 85000,
      under5Pct: 5.2,
      age5To9: 82000,
      age5To9Pct: 5,
      age10To14: 80000,
      age10To14Pct: 4.8,
      age15To19: 92000,
      age15To19Pct: 5.6,
      age20To24: 105000,
      age20To24Pct: 6.4,
      age25To34: 260000,
      age25To34Pct: 15.8,
      age35To44: 245000,
      age35To44Pct: 14.8,
      age45To54: 220000,
      age45To54Pct: 13.3,
      age55To59: 105000,
      age55To59Pct: 6.4,
      age60To64: 95000,
      age60To64Pct: 5.8,
      age65To74: 170000,
      age65To74Pct: 10.3,
      age75To84: 85000,
      age75To84Pct: 5.2,
      age85Plus: 26000,
      age85PlusPct: 1.6,
      medianAge: 39.2,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[31] = "-";
    suppressedRow[32] = "***";

    const metric = mapCensusAcsAgeSexRow(header, suppressedRow, source, county);

    expect(metric.age85Plus).toBeNull();
    expect(metric.age85PlusPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsAgeSexResponse([header, row], source, county);

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() => parseCensusAcsAgeSexResponse([header], source, county)).toThrow(
      "did not include data rows",
    );

    expect(() =>
      mapCensusAcsAgeSexRow(
        header.filter((field) => field !== "DP05_0001E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP05_0001E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsAgeSex({
        ...source,
        sourceName: "ACS Age and Sex",
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
      ingestCensusAcsAgeSex({
        ...source,
        sourceName: "ACS Age and Sex",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS age and sex request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsAgeSex({
        ...source,
        sourceName: "ACS Age and Sex",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
