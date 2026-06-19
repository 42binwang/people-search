import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCensusAcsMigrationFlowsUrl,
  CENSUS_ACS_FLOW_VARIABLES,
  ingestCensusAcsMigrationFlows,
  mapCensusAcsMigrationFlowRow,
  parseCensusAcsMigrationFlowsResponse,
} from "@/lib/sources/census-acs-migration-flows";

const source = {
  sourceId: "census_acs_flows_2022_bay_area",
  hub: "Bay Area",
  year: 2022,
  periodLabel: "2018-2022",
};

const county = {
  label: "Alameda County, California",
  state: "06",
  county: "001",
};

const header = [
  CENSUS_ACS_FLOW_VARIABLES.referenceName,
  CENSUS_ACS_FLOW_VARIABLES.secondName,
  CENSUS_ACS_FLOW_VARIABLES.referenceGeoId,
  CENSUS_ACS_FLOW_VARIABLES.secondGeoId,
  CENSUS_ACS_FLOW_VARIABLES.movedIn,
  CENSUS_ACS_FLOW_VARIABLES.movedInMargin,
  CENSUS_ACS_FLOW_VARIABLES.movedOut,
  CENSUS_ACS_FLOW_VARIABLES.movedOutMargin,
  CENSUS_ACS_FLOW_VARIABLES.movedNet,
  CENSUS_ACS_FLOW_VARIABLES.movedNetMargin,
  "state",
  "county",
];

const row = [
  "Alameda County, California",
  "King County, Washington",
  "06001",
  "53033",
  "1200",
  "150",
  "900",
  "120",
  "300",
  "80",
  "06",
  "001",
];

describe("Census ACS migration-flow source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENSUS_API_KEY;
  });

  it("builds county-level ACS migration-flow URLs with normalized FIPS codes", () => {
    const url = new URL(
      buildCensusAcsMigrationFlowsUrl({
        year: 2022,
        county: { label: "Alameda", state: "6", county: "1" },
        apiKey: "abc123",
      }),
    );

    expect(url.pathname).toBe("/data/2022/acs/flows");
    expect(url.searchParams.get("for")).toBe("county:001");
    expect(url.searchParams.get("in")).toBe("state:06");
    expect(url.searchParams.get("key")).toBe("abc123");
    expect(url.searchParams.get("get")).toContain("MOVEDIN");
    expect(url.searchParams.get("get")).toContain("MOVEDNET_M");
  });

  it("maps aggregate ACS flow rows to migration flow metrics", () => {
    const flow = mapCensusAcsMigrationFlowRow(header, row, source, county);

    expect(flow).toMatchObject({
      sourceId: "census_acs_flows_2022_bay_area",
      sourceRecordId: "2018-2022-acs-flow-53033-06001-county_to_county",
      yearStart: 2018,
      yearEnd: 2022,
      hub: "Bay Area",
      flowDirection: "inflow",
      flowKind: "county_to_county",
      originStateFips: "53",
      originCountyFips: "033",
      originName: "King County, Washington",
      destinationStateFips: "06",
      destinationCountyFips: "001",
      destinationName: "Alameda County, California",
      returnsCount: null,
      individualsCount: 1200,
      adjustedGrossIncome: null,
    });
    expect(flow.raw).toMatchObject({
      MOVEDIN: "1200",
      MOVEDNET_M: "80",
    });
  });

  it("classifies same-county ACS rows as non-movers and preserves suppressed estimates as null", () => {
    const sameCountyRow = [...row];
    sameCountyRow[3] = "06001";
    sameCountyRow[4] = "***";

    const flow = mapCensusAcsMigrationFlowRow(
      header,
      sameCountyRow,
      source,
      county,
    );

    expect(flow.flowKind).toBe("non_movers");
    expect(flow.individualsCount).toBeNull();
  });

  it("parses ACS array responses with data rows", () => {
    const flows = parseCensusAcsMigrationFlowsResponse(
      [header, row],
      source,
      county,
    );

    expect(flows).toHaveLength(1);
    expect(flows[0].originCountyFips).toBe("033");
  });

  it("throws explicit errors for malformed ACS responses", () => {
    expect(() =>
      parseCensusAcsMigrationFlowsResponse([header], source, county),
    ).toThrow("did not include data rows");

    expect(() =>
      mapCensusAcsMigrationFlowRow(
        header.filter((field) => field !== "MOVEDIN"),
        row,
        source,
        county,
      ),
    ).toThrow("missing field: MOVEDIN");
  });

  it("requires a Census API key before ingestion", async () => {
    await expect(
      ingestCensusAcsMigrationFlows({
        ...source,
        sourceName: "ACS Flows",
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
      ingestCensusAcsMigrationFlows({
        ...source,
        sourceName: "ACS Flows",
        counties: [county],
        apiKey: "test-key",
      }),
    ).rejects.toThrow("Census ACS migration-flow request failed: 503");
  });
});
