import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsHouseholdCompositionUrl,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES,
  ingestCensusAcsHouseholdComposition,
  mapCensusAcsHouseholdCompositionRow,
  parseCensusAcsHouseholdCompositionResponse,
} from "@/lib/sources/census-acs-household-composition";

const source = {
  sourceId: "census_acs_household_composition_2024_bay_area",
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
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.totalHouseholds,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleHouseholds,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleHouseholdsPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleWithChildren,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleWithChildrenPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.cohabitingCoupleHouseholds,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.cohabitingCoupleHouseholdsPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.cohabitingCoupleWithChildren,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.cohabitingCoupleWithChildrenPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleNoSpouseHouseholds,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleNoSpouseHouseholdsPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlone,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlonePct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlone65Plus,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlone65PlusPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleNoSpouseHouseholds,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleNoSpouseHouseholdsPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlone,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlonePct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlone65Plus,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlone65PlusPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWithUnder18,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWithUnder18Pct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWith65Plus,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWith65PlusPct,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.averageHouseholdSize,
  CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.averageFamilySize,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "640000",
  "330000",
  "51.6",
  "120000",
  "18.8",
  "52000",
  "8.1",
  "16000",
  "2.5",
  "93000",
  "14.5",
  "60000",
  "9.4",
  "18000",
  "2.8",
  "165000",
  "25.8",
  "118000",
  "18.4",
  "36000",
  "5.6",
  "190000",
  "29.7",
  "210000",
  "32.8",
  "2.75",
  "3.22",
  "06",
  "001",
];

describe("Census ACS household composition source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsHouseholdCompositionUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP02_0001E");
    expect(url.searchParams.get("get")).toContain("DP02_0017E");
  });

  it("maps aggregate DP02 rows to household composition metrics", () => {
    const metric = mapCensusAcsHouseholdCompositionRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_household_composition_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      totalHouseholds: 640000,
      marriedCoupleHouseholds: 330000,
      marriedCoupleHouseholdsPct: 51.6,
      cohabitingCoupleHouseholds: 52000,
      cohabitingCoupleHouseholdsPct: 8.1,
      maleLivingAlone: 60000,
      maleLivingAlonePct: 9.4,
      femaleLivingAlone: 118000,
      femaleLivingAlonePct: 18.4,
      householdsWithUnder18: 190000,
      householdsWithUnder18Pct: 29.7,
      householdsWith65Plus: 210000,
      householdsWith65PlusPct: 32.8,
      averageHouseholdSize: 2.75,
      averageFamilySize: 3.22,
      singlePersonHouseholds: 178000,
      singlePersonHouseholdsPct: 27.8,
      livingAlone65Plus: 54000,
      livingAlone65PlusPct: 8.4,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null while deriving available totals", () => {
    const suppressedRow = [...row];
    suppressedRow[1] = "-";
    suppressedRow[12] = "***";
    suppressedRow[13] = "***";

    const metric = mapCensusAcsHouseholdCompositionRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.totalHouseholds).toBeNull();
    expect(metric.maleLivingAlone).toBeNull();
    expect(metric.singlePersonHouseholds).toBe(118000);
    expect(metric.singlePersonHouseholdsPct).toBe(18.4);
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsHouseholdCompositionResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsHouseholdCompositionResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsHouseholdCompositionRow(
        header.filter((field) => field !== "DP02_0001E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP02_0001E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsHouseholdComposition({
        ...source,
        sourceName: "ACS Household Composition",
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
      ingestCensusAcsHouseholdComposition({
        ...source,
        sourceName: "ACS Household Composition",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS household composition request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsHouseholdComposition({
        ...source,
        sourceName: "ACS Household Composition",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
