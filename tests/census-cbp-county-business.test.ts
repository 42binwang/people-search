import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusCbpCountyBusinessUrl,
  ingestCensusCbpCountyBusiness,
  mapCensusCbpCountyBusinessRow,
  parseCensusCbpCountyBusinessResponse,
} from "@/lib/sources/census-cbp-county-business";

const source = {
  sourceId: "census_cbp_county_business_2023_bay_area",
  hub: "Bay Area",
  year: 2023,
};

const county = {
  label: "Alameda County, California",
  state: "6",
  county: "1",
};

const header = [
  "NAME",
  "ESTAB",
  "EMP",
  "PAYANN",
  "NAICS2017",
  "NAICS2017_LABEL",
  "LFO",
  "LFO_LABEL",
  "EMPSZES",
  "EMPSZES_LABEL",
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "52000",
  "812345",
  "98000000",
  "00",
  "Total for all sectors",
  "001",
  "All establishments",
  "001",
  "All establishments",
  "06",
  "001",
];

describe("Census CBP county business source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level CBP URLs with all-sector filters and normalized FIPS codes", () => {
    const url = new URL(
      buildCensusCbpCountyBusinessUrl({
        year: 2023,
        county,
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2023/cbp");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("NAICS2017")).toBe("00");
    expect(url.searchParams.get("LFO")).toBe("001");
    expect(url.searchParams.get("EMPSZES")).toBe("001");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("ESTAB");
    expect(url.searchParams.get("get")).toContain("PAYANN");
  });

  it("maps aggregate CBP rows to county business metrics", () => {
    const metric = mapCensusCbpCountyBusinessRow(header, row, source, county);

    expect(metric).toMatchObject({
      sourceId: "census_cbp_county_business_2023_bay_area",
      sourceRecordId: "2023-06001-00-001-001",
      hub: "Bay Area",
      year: 2023,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County, California",
      naicsCode: "00",
      naicsLabel: "Total for all sectors",
      legalFormCode: "001",
      legalFormLabel: "All establishments",
      employmentSizeCode: "001",
      employmentSizeLabel: "All establishments",
      establishments: 52000,
      employment: 812345,
      annualPayrollThousands: 98000000,
    });
    expect(metric.raw).toMatchObject({
      NAME: "Alameda County, California",
      state: "06",
      county: "001",
    });
  });

  it("keeps suppressed values null", () => {
    const suppressedRow = [...row];
    suppressedRow[2] = "S";
    suppressedRow[3] = "***";

    const metric = mapCensusCbpCountyBusinessRow(
      header,
      suppressedRow,
      source,
      county,
    );

    expect(metric.employment).toBeNull();
    expect(metric.annualPayrollThousands).toBeNull();
  });

  it("parses Census array responses with one or more data rows", () => {
    const metrics = parseCensusCbpCountyBusinessResponse(
      [header, row],
      source,
      county,
    );

    expect(metrics).toHaveLength(1);
    expect(metrics[0].countyFips).toBe("001");
  });

  it("throws explicit errors for malformed or incomplete Census responses", () => {
    expect(() =>
      parseCensusCbpCountyBusinessResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusCbpCountyBusinessRow(
        header.filter((field) => field !== "ESTAB"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: ESTAB");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusCbpCountyBusiness({
        ...source,
        sourceName: "CBP County Business",
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
      ingestCensusCbpCountyBusiness({
        ...source,
        sourceName: "CBP County Business",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census CBP county business request failed: 503");
  });

  it("throws explicit errors for non-JSON Census responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestCensusCbpCountyBusiness({
        ...source,
        sourceName: "CBP County Business",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
