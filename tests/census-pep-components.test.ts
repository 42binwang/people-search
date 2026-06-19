import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ingestCensusPepComponents,
  mapCensusPepComponentRow,
  mapCensusPepComponentRows,
  parseCensusPepComponentsCsv,
} from "@/lib/sources/census-pep-components";

const source = {
  sourceId: "census_pep_2025_bay_area_components",
  hub: "Bay Area",
  vintage: 2025,
  years: [2024, 2025],
  counties: [
    { label: "Alameda County, California", state: "06", county: "001" },
    { label: "San Francisco County, California", state: "06", county: "075" },
  ],
};

const row = {
  SUMLEV: "050",
  STATE: "06",
  COUNTY: "001",
  STNAME: "California",
  CTYNAME: "Alameda County",
  POPESTIMATE2024: "1643450",
  NPOPCHG2024: "12000",
  BIRTHS2024: "15000",
  DEATHS2024: "9000",
  NATURALCHG2024: "6000",
  INTERNATIONALMIG2024: "8500",
  DOMESTICMIG2024: "-2500",
  NETMIG2024: "6000",
  RESIDUAL2024: "0",
  RINTERNATIONALMIG2024: "5.20",
  RDOMESTICMIG2024: "-1.53",
  RNETMIG2024: "3.67",
  POPESTIMATE2025: "1650000",
  NPOPCHG2025: "6550",
  BIRTHS2025: "15100",
  DEATHS2025: "9100",
  NATURALCHG2025: "6000",
  INTERNATIONALMIG2025: "9000",
  DOMESTICMIG2025: "-8400",
  NETMIG2025: "600",
  RESIDUAL2025: "-50",
  RINTERNATIONALMIG2025: "5.45",
  RDOMESTICMIG2025: "-5.09",
  RNETMIG2025: "0.36",
};

describe("Census PEP components source mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Census PEP components CSV rows", () => {
    const rows = parseCensusPepComponentsCsv(
      [
        Object.keys(row).join(","),
        Object.values(row).join(","),
      ].join("\n"),
    );

    expect(rows).toEqual([row]);
  });

  it("maps a county-year row to aggregate population-change metrics", () => {
    const metric = mapCensusPepComponentRow(row, 2025, source);

    expect(metric).toMatchObject({
      sourceId: "census_pep_2025_bay_area_components",
      sourceRecordId: "2025-06001-2025",
      hub: "Bay Area",
      year: 2025,
      stateFips: "06",
      countyFips: "001",
      countyName: "Alameda County",
      stateName: "California",
      populationEstimate: 1650000,
      netPopulationChange: 6550,
      births: 15100,
      deaths: 9100,
      naturalChange: 6000,
      internationalMigration: 9000,
      domesticMigration: -8400,
      netMigration: 600,
      residual: -50,
      domesticMigrationRate: -5.09,
      internationalMigrationRate: 5.45,
      netMigrationRate: 0.36,
    });
  });

  it("filters to configured counties and expands requested years", () => {
    const metrics = mapCensusPepComponentRows(
      [
        row,
        {
          ...row,
          COUNTY: "999",
          CTYNAME: "Other County",
        },
        {
          ...row,
          SUMLEV: "040",
          COUNTY: "000",
          CTYNAME: "California",
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(2);
    expect(metrics.map((metric) => metric.year)).toEqual([2024, 2025]);
  });

  it("stores suppressed or unavailable values as null", () => {
    const metric = mapCensusPepComponentRow(
      {
        ...row,
        DOMESTICMIG2025: "***",
        RDOMESTICMIG2025: "-",
      },
      2025,
      source,
    );

    expect(metric.domesticMigration).toBeNull();
    expect(metric.domesticMigrationRate).toBeNull();
  });

  it("throws explicit errors for empty files and missing fields", () => {
    expect(() => parseCensusPepComponentsCsv("")).toThrow(
      "did not include data rows",
    );

    expect(() =>
      mapCensusPepComponentRow(
        {
          ...row,
          NETMIG2025: undefined as unknown as string,
        },
        2025,
        source,
      ),
    ).toThrow("missing field: NETMIG2025");
  });

  it("surfaces failed Census PEP downloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      ingestCensusPepComponents({
        ...source,
        sourceName: "Census PEP Test",
        url: "https://example.test/pep.csv",
      }),
    ).rejects.toThrow("Census PEP components request failed: 503");
  });
});
