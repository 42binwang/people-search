import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsLanguageProficiencyUrl,
  CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES,
  ingestCensusAcsLanguageProficiency,
  mapCensusAcsLanguageProficiencyRow,
  parseCensusAcsLanguageProficiencyResponse,
} from "@/lib/sources/census-acs-language-proficiency";

const source = {
  sourceId: "census_acs_language_proficiency_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1580000",
  "900000",
  "57.0",
  "680000",
  "43.0",
  "210000",
  "13.3",
  "250000",
  "15.8",
  "75000",
  "4.7",
  "120000",
  "7.6",
  "25000",
  "1.6",
  "270000",
  "17.1",
  "92000",
  "5.8",
  "40000",
  "2.5",
  "18000",
  "1.1",
  "06",
  "001",
];

describe("Census ACS language proficiency source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsLanguageProficiencyUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP02_0112E");
    expect(url.searchParams.get("get")).toContain("DP02_0123PE");
  });

  it("maps aggregate DP02 rows to language proficiency metrics", () => {
    const metric = mapCensusAcsLanguageProficiencyRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_language_proficiency_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      population5Plus: 1580000,
      englishOnly: 900000,
      englishOnlyPct: 57,
      languageOtherThanEnglish: 680000,
      languageOtherThanEnglishPct: 43,
      limitedEnglish: 210000,
      limitedEnglishPct: 13.3,
      spanish: 250000,
      spanishPct: 15.8,
      spanishLimitedEnglish: 75000,
      spanishLimitedEnglishPct: 4.7,
      otherIndoEuropean: 120000,
      otherIndoEuropeanPct: 7.6,
      otherIndoEuropeanLimitedEnglish: 25000,
      otherIndoEuropeanLimitedEnglishPct: 1.6,
      asianPacificIslander: 270000,
      asianPacificIslanderPct: 17.1,
      asianPacificIslanderLimitedEnglish: 92000,
      asianPacificIslanderLimitedEnglishPct: 5.8,
      otherLanguages: 40000,
      otherLanguagesPct: 2.5,
      otherLanguagesLimitedEnglish: 18000,
      otherLanguagesLimitedEnglishPct: 1.1,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[6] = "-";
    suppressedRow[7] = "***";

    const metric = mapCensusAcsLanguageProficiencyRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.limitedEnglish).toBeNull();
    expect(metric.limitedEnglishPct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsLanguageProficiencyResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsLanguageProficiencyResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsLanguageProficiencyRow(
        header.filter((field) => field !== "DP02_0112E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP02_0112E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsLanguageProficiency({
        ...source,
        sourceName: "ACS Language Proficiency",
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
      ingestCensusAcsLanguageProficiency({
        ...source,
        sourceName: "ACS Language Proficiency",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS language proficiency request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsLanguageProficiency({
        ...source,
        sourceName: "ACS Language Proficiency",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
