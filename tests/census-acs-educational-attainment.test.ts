import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsEducationalAttainmentUrl,
  CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES,
  ingestCensusAcsEducationalAttainment,
  mapCensusAcsEducationalAttainmentRow,
  parseCensusAcsEducationalAttainmentResponse,
} from "@/lib/sources/census-acs-educational-attainment";

const source = {
  sourceId: "census_acs_educational_attainment_2024_bay_area",
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
  ...Object.values(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES),
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "1100000",
  "42000",
  "3.8",
  "52000",
  "4.7",
  "145000",
  "13.2",
  "190000",
  "17.3",
  "85000",
  "7.7",
  "360000",
  "32.7",
  "226000",
  "20.5",
  "1006000",
  "91.5",
  "586000",
  "53.3",
  "06",
  "001",
];

describe("Census ACS educational attainment source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS profile URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsEducationalAttainmentUrl({
        year: 2024,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2024/acs/acs5/profile");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("DP02_0059E");
    expect(url.searchParams.get("get")).toContain("DP02_0068PE");
  });

  it("maps aggregate DP02 rows to educational attainment metrics", () => {
    const metric = mapCensusAcsEducationalAttainmentRow(
      header,
      row,
      source,
      county,
    );

    expect(metric).toMatchObject({
      sourceId: "census_acs_educational_attainment_2024_bay_area",
      sourceRecordId: "2024-06001",
      hub: "Bay Area",
      year: 2024,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      population25Plus: 1100000,
      lessThan9thGrade: 42000,
      lessThan9thGradePct: 3.8,
      ninthTo12thNoDiploma: 52000,
      ninthTo12thNoDiplomaPct: 4.7,
      highSchoolGraduate: 145000,
      highSchoolGraduatePct: 13.2,
      someCollegeNoDegree: 190000,
      someCollegeNoDegreePct: 17.3,
      associatesDegree: 85000,
      associatesDegreePct: 7.7,
      bachelorsDegree: 360000,
      bachelorsDegreePct: 32.7,
      graduateProfessionalDegree: 226000,
      graduateProfessionalDegreePct: 20.5,
      highSchoolGraduateOrHigher: 1006000,
      highSchoolGraduateOrHigherPct: 91.5,
      bachelorsDegreeOrHigher: 586000,
      bachelorsDegreeOrHigherPct: 53.3,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[12] = "-";
    suppressedRow[13] = "***";

    const metric = mapCensusAcsEducationalAttainmentRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.bachelorsDegree).toBeNull();
    expect(metric.bachelorsDegreePct).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusAcsEducationalAttainmentResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusAcsEducationalAttainmentResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsEducationalAttainmentRow(
        header.filter((field) => field !== "DP02_0059E"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: DP02_0059E");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsEducationalAttainment({
        ...source,
        sourceName: "ACS Educational Attainment",
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
      ingestCensusAcsEducationalAttainment({
        ...source,
        sourceName: "ACS Educational Attainment",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow(
      "Census ACS educational attainment request failed: 503",
    );
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusAcsEducationalAttainment({
        ...source,
        sourceName: "ACS Educational Attainment",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
