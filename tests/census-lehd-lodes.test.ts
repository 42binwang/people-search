import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ingestCensusLehdLodes,
  mapCensusLehdLodesRows,
  parseCensusLehdLodesCsv,
} from "@/lib/sources/census-lehd-lodes";

const source = {
  sourceId: "census_lehd_lodes_2023_bay_area_commute_flows",
  sourceName: "Census LEHD LODES Bay Area",
  hub: "Bay Area",
  year: 2023,
  jobType: "JT00",
  url: "https://example.test/ca_od_main_JT00_2023.csv",
  counties: [
    { label: "Alameda County, California", state: "06", county: "001" },
    { label: "San Francisco County, California", state: "06", county: "075" },
  ],
};

const csv = [
  "w_geocode,h_geocode,S000,SA01,SA02,SA03,SE01,SE02,SE03,createdate",
  "060014001001001,060014002001001,10,2,6,2,1,4,5,20250801",
  "060754001001001,060014002001001,5,1,3,1,0,2,3,20250801",
  "060754001001001,060814002001001,7,2,4,1,1,3,3,20250801",
].join("\n");

describe("Census LEHD LODES source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses plain and gzipped LODES CSV rows", () => {
    expect(parseCensusLehdLodesCsv(csv)).toHaveLength(3);
    expect(parseCensusLehdLodesCsv(gzipSync(csv))).toHaveLength(3);
  });

  it("aggregates block-level OD rows to county-pair commute flows", () => {
    const metrics = mapCensusLehdLodesRows(
      parseCensusLehdLodesCsv(csv),
      source,
    );

    expect(metrics).toHaveLength(3);
    expect(metrics[0]).toMatchObject({
      sourceRecordId: "2023-JT00-06001-06001",
      hub: "Bay Area",
      year: 2023,
      jobType: "JT00",
      flowKind: "within_target_county",
      homeStateFips: "06",
      homeCountyFips: "001",
      homeCountyName: "Alameda County, California",
      workStateFips: "06",
      workCountyFips: "001",
      workCountyName: "Alameda County, California",
      totalJobs: 10,
      jobsAge29OrYounger: 2,
      jobsAge30To54: 6,
      jobsAge55OrOlder: 2,
      jobsEarnings1250OrLess: 1,
      jobsEarnings1251To3333: 4,
      jobsEarnings3333Plus: 5,
    });
    expect(metrics[1]).toMatchObject({
      sourceRecordId: "2023-JT00-06001-06075",
      flowKind: "between_target_counties",
      totalJobs: 5,
    });
    expect(metrics[2]).toMatchObject({
      sourceRecordId: "2023-JT00-06081-06075",
      flowKind: "worker_home_origin",
      homeCountyName: "County 06081",
      workCountyName: "San Francisco County, California",
      totalJobs: 7,
    });
  });

  it("sums multiple rows in the same county pair", () => {
    const rows = parseCensusLehdLodesCsv(
      [
        "w_geocode,h_geocode,S000,SA01,SA02,SA03,SE01,SE02,SE03",
        "060754001001001,060014002001001,5,1,3,1,0,2,3",
        "060754001001002,060014002001002,6,2,3,1,1,2,3",
      ].join("\n"),
    );
    const metrics = mapCensusLehdLodesRows(rows, source);

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      sourceRecordId: "2023-JT00-06001-06075",
      totalJobs: 11,
      jobsAge29OrYounger: 3,
      jobsAge30To54: 6,
      jobsAge55OrOlder: 2,
      jobsEarnings1250OrLess: 1,
      jobsEarnings1251To3333: 4,
      jobsEarnings3333Plus: 6,
      raw: {
        aggregatedRows: 2,
        sourceGeography: "census_block",
        storedGeography: "county_pair",
      },
    });
  });

  it("stores unavailable optional segment counts as null", () => {
    const rows = parseCensusLehdLodesCsv(
      [
        "w_geocode,h_geocode,S000,SA01,SA02,SA03,SE01,SE02,SE03",
        "060754001001001,060014002001001,5,,,,,,",
      ].join("\n"),
    );
    const [metric] = mapCensusLehdLodesRows(rows, source);

    expect(metric.totalJobs).toBe(5);
    expect(metric.jobsAge29OrYounger).toBeNull();
    expect(metric.jobsEarnings3333Plus).toBeNull();
  });

  it("throws explicit errors for empty files, missing fields, and malformed geocodes", () => {
    expect(() => parseCensusLehdLodesCsv("")).toThrow(
      "did not include data rows",
    );

    expect(() =>
      mapCensusLehdLodesRows([{ w_geocode: "06001", S000: "1" }], source),
    ).toThrow("missing field: h_geocode");

    expect(() =>
      mapCensusLehdLodesRows(
        [{ w_geocode: "1", h_geocode: "060014002001001", S000: "1" }],
        source,
      ),
    ).toThrow("work geocode is malformed");
  });

  it("surfaces failed downloads before importing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(ingestCensusLehdLodes(source)).rejects.toThrow(
      "Census LEHD LODES request failed: 503",
    );
  });

  it("streams, aggregates, and imports fetched CSV rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(csv));

    const result = await ingestCensusLehdLodes(source);

    expect(result).toMatchObject({
      fetched: 3,
      imported: 3,
    });
  });
});
