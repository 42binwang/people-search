import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ingestIrsSoiMigrationFlows,
  mapIrsSoiMigrationRow,
  mapIrsSoiMigrationRows,
  parseIrsSoiMigrationCsv,
} from "@/lib/sources/irs-soi-migration";

const source = {
  sourceId: "irs_soi_2022_2023_bay_area_migration",
  hub: "Bay Area",
  yearStart: 2022,
  yearEnd: 2023,
  counties: [
    { label: "Alameda County, California", state: "06", county: "001" },
    { label: "San Francisco County, California", state: "06", county: "075" },
  ],
};

const inflowRow = {
  y2_statefips: "06",
  y2_countyfips: "001",
  y1_statefips: "36",
  y1_countyfips: "061",
  y1_state: "NY",
  y1_countyname: "New York County",
  n1: "123",
  n2: "210",
  agi: "45678",
};

const outflowRow = {
  y1_statefips: "06",
  y1_countyfips: "001",
  y2_statefips: "53",
  y2_countyfips: "033",
  y2_state: "WA",
  y2_countyname: "King County",
  n1: "98",
  n2: "176",
  agi: "34567",
};

describe("IRS SOI migration source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses IRS county migration CSV rows", () => {
    const rows = parseIrsSoiMigrationCsv(
      [
        "y2_statefips,y2_countyfips,y1_statefips,y1_countyfips,y1_state,y1_countyname,n1,n2,agi",
        "06,001,36,061,NY,New York County,123,210,45678",
      ].join("\n"),
    );

    expect(rows).toEqual([inflowRow]);
  });

  it("maps inflow rows into aggregate county flow metrics", () => {
    const flow = mapIrsSoiMigrationRow(inflowRow, "inflow", source);

    expect(flow).toMatchObject({
      sourceId: "irs_soi_2022_2023_bay_area_migration",
      sourceRecordId: "2022-2023-inflow-36-061-06-001-county_to_county",
      yearStart: 2022,
      yearEnd: 2023,
      hub: "Bay Area",
      flowDirection: "inflow",
      flowKind: "county_to_county",
      originStateFips: "36",
      originCountyFips: "061",
      originName: "New York County",
      destinationStateFips: "06",
      destinationCountyFips: "001",
      destinationName: "Alameda County, California",
      returnsCount: 123,
      individualsCount: 210,
      adjustedGrossIncome: 45678,
    });
  });

  it("maps outflow rows into aggregate county flow metrics", () => {
    const flow = mapIrsSoiMigrationRow(outflowRow, "outflow", source);

    expect(flow).toMatchObject({
      sourceRecordId: "2022-2023-outflow-06-001-53-033-county_to_county",
      flowDirection: "outflow",
      originName: "Alameda County, California",
      destinationName: "King County",
      destinationStateFips: "53",
      destinationCountyFips: "033",
    });
  });

  it("classifies IRS aggregate total rows and null numeric values", () => {
    const flow = mapIrsSoiMigrationRow(
      {
        ...inflowRow,
        y1_statefips: "97",
        y1_countyfips: "003",
        y1_countyname: "Alameda County Total Migration-Different State",
        n1: "-",
        n2: "***",
      },
      "inflow",
      source,
    );

    expect(flow.flowKind).toBe("total_different_state");
    expect(flow.returnsCount).toBeNull();
    expect(flow.individualsCount).toBeNull();
  });

  it("filters rows to configured hub counties", () => {
    const flows = mapIrsSoiMigrationRows(
      [
        inflowRow,
        {
          ...inflowRow,
          y2_countyfips: "999",
        },
      ],
      "inflow",
      source,
    );

    expect(flows).toHaveLength(1);
    expect(flows[0].destinationCountyFips).toBe("001");
  });

  it("throws explicit errors for missing IRS fields and empty files", () => {
    expect(() => parseIrsSoiMigrationCsv("")).toThrow(
      "did not include data rows",
    );

    expect(() =>
      mapIrsSoiMigrationRow(
        {
          ...inflowRow,
          y1_countyname: undefined as unknown as string,
        },
        "inflow",
        source,
      ),
    ).toThrow("missing field: y1_countyname");
  });

  it("surfaces failed IRS downloads before importing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      ingestIrsSoiMigrationFlows({
        ...source,
        sourceName: "IRS SOI Test",
        inflowUrl: "https://example.test/inflow.csv",
        outflowUrl: "https://example.test/outflow.csv",
      }),
    ).rejects.toThrow("IRS SOI migration inflow request failed: 503");
  });
});
