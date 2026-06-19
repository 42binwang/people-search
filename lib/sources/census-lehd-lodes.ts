import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, gunzipSync } from "node:zlib";
import { parse as parseCsvStream } from "csv-parse";
import { parse as parseCsvSync } from "csv-parse/sync";
import {
  upsertAggregateCommuteFlowMetric,
  upsertApprovedSource,
  type AggregateCommuteFlowMetricInput,
} from "@/lib/db";

export type CensusLehdLodesCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusLehdLodesInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  jobType: string;
  url: string;
  counties: CensusLehdLodesCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
};

export type CensusLehdLodesIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

type LodesAccumulator = {
  rowsRead: number;
  countyLookup: Map<string, string>;
  groups: Map<string, CensusLehdLodesFlowAccumulator>;
};

type CensusLehdLodesFlowAccumulator = {
  homeStateFips: string;
  homeCountyFips: string;
  homeCountyName: string;
  workStateFips: string;
  workCountyFips: string;
  workCountyName: string;
  flowKind: string;
  totalJobs: number;
  jobsAge29OrYounger: number;
  jobsAge30To54: number;
  jobsAge55OrOlder: number;
  jobsEarnings1250OrLess: number;
  jobsEarnings1251To3333: number;
  jobsEarnings3333Plus: number;
  hasAge29OrYounger: boolean;
  hasAge30To54: boolean;
  hasAge55OrOlder: boolean;
  hasEarnings1250OrLess: boolean;
  hasEarnings1251To3333: boolean;
  hasEarnings3333Plus: boolean;
  sourceRows: number;
};

export async function ingestCensusLehdLodes(
  input: CensusLehdLodesInput,
): Promise<CensusLehdLodesIngestResult> {
  registerCensusLehdLodesSource(input);

  const response = await fetch(input.url, {
    headers: {
      accept: "text/csv,application/gzip,*/*;q=0.5",
      "user-agent": "PeopleSearchCensusLehdLodesIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Census LEHD LODES request failed: ${response.status} ${response.statusText}`,
    );
  }

  const accumulator = createLodesAccumulator(input.counties);
  await streamCensusLehdLodesRows(response, input.url, accumulator);
  const metrics = finalizeCensusLehdLodesMetrics(accumulator, input);

  for (const metric of metrics) {
    upsertAggregateCommuteFlowMetric(metric);
  }

  return {
    fetched: accumulator.rowsRead,
    imported: metrics.length,
    url: input.url,
  };
}

export function registerCensusLehdLodesSource(input: CensusLehdLodesInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate residence-work commute flows",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_bulk_file",
    licenseUrl:
      input.licenseUrl ?? "https://lehd.ces.census.gov/data/#lodes",
    notes:
      input.notes ??
      "U.S. Census LEHD Origin-Destination Employment Statistics (LODES) OD file aggregated from block-level rows to county-pair commute flows. Stores aggregate job counts only and must not be used as individual residence evidence.",
  });
}

export function parseCensusLehdLodesCsv(
  input: string | Buffer,
): CensusLehdLodesRow[] {
  const text = Buffer.isBuffer(input)
    ? gunzipSync(input).toString("utf8")
    : input;
  const rows = parseCsvSync(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CensusLehdLodesRow[];

  if (rows.length === 0) {
    throw new Error("Census LEHD LODES CSV did not include data rows.");
  }

  return rows;
}

export function mapCensusLehdLodesRows(
  rows: CensusLehdLodesRow[],
  input: Pick<
    CensusLehdLodesInput,
    "sourceId" | "hub" | "year" | "jobType" | "counties"
  >,
): AggregateCommuteFlowMetricInput[] {
  const accumulator = createLodesAccumulator(input.counties);
  for (const row of rows) {
    addCensusLehdLodesRow(row, accumulator);
  }
  return finalizeCensusLehdLodesMetrics(accumulator, input);
}

export function addCensusLehdLodesRow(
  row: CensusLehdLodesRow,
  accumulator: LodesAccumulator,
) {
  assertLodesRowShape(row);
  accumulator.rowsRead += 1;

  const home = parseBlockCounty(row.h_geocode, "home");
  const work = parseBlockCounty(row.w_geocode, "work");
  const homeKey = countyKey(home.stateFips, home.countyFips);
  const workKey = countyKey(work.stateFips, work.countyFips);
  const homeIsTarget = accumulator.countyLookup.has(homeKey);
  const workIsTarget = accumulator.countyLookup.has(workKey);

  if (!homeIsTarget && !workIsTarget) {
    return;
  }

  const groupKey = `${homeKey}-${workKey}`;
  const group =
    accumulator.groups.get(groupKey) ??
    createFlowAccumulator({
      homeStateFips: home.stateFips,
      homeCountyFips: home.countyFips,
      homeCountyName:
        accumulator.countyLookup.get(homeKey) ?? `County ${homeKey}`,
      workStateFips: work.stateFips,
      workCountyFips: work.countyFips,
      workCountyName:
        accumulator.countyLookup.get(workKey) ?? `County ${workKey}`,
      flowKind: getFlowKind(homeKey, workKey, homeIsTarget, workIsTarget),
    });

  group.totalJobs += parseRequiredInteger(row.S000, "S000");
  addOptionalCount(group, "jobsAge29OrYounger", "hasAge29OrYounger", row.SA01);
  addOptionalCount(group, "jobsAge30To54", "hasAge30To54", row.SA02);
  addOptionalCount(group, "jobsAge55OrOlder", "hasAge55OrOlder", row.SA03);
  addOptionalCount(
    group,
    "jobsEarnings1250OrLess",
    "hasEarnings1250OrLess",
    row.SE01,
  );
  addOptionalCount(
    group,
    "jobsEarnings1251To3333",
    "hasEarnings1251To3333",
    row.SE02,
  );
  addOptionalCount(
    group,
    "jobsEarnings3333Plus",
    "hasEarnings3333Plus",
    row.SE03,
  );
  group.sourceRows += 1;
  accumulator.groups.set(groupKey, group);
}

function finalizeCensusLehdLodesMetrics(
  accumulator: LodesAccumulator,
  input: Pick<CensusLehdLodesInput, "sourceId" | "hub" | "year" | "jobType">,
): AggregateCommuteFlowMetricInput[] {
  return Array.from(accumulator.groups.values())
    .sort((left, right) =>
      `${left.homeStateFips}${left.homeCountyFips}-${left.workStateFips}${left.workCountyFips}`.localeCompare(
        `${right.homeStateFips}${right.homeCountyFips}-${right.workStateFips}${right.workCountyFips}`,
      ),
    )
    .map((group) => ({
      sourceId: input.sourceId,
      sourceRecordId: [
        input.year,
        input.jobType,
        `${group.homeStateFips}${group.homeCountyFips}`,
        `${group.workStateFips}${group.workCountyFips}`,
      ].join("-"),
      hub: input.hub,
      year: input.year,
      jobType: input.jobType,
      flowKind: group.flowKind,
      homeStateFips: group.homeStateFips,
      homeCountyFips: group.homeCountyFips,
      homeCountyName: group.homeCountyName,
      workStateFips: group.workStateFips,
      workCountyFips: group.workCountyFips,
      workCountyName: group.workCountyName,
      totalJobs: group.totalJobs,
      jobsAge29OrYounger: group.hasAge29OrYounger
        ? group.jobsAge29OrYounger
        : null,
      jobsAge30To54: group.hasAge30To54 ? group.jobsAge30To54 : null,
      jobsAge55OrOlder: group.hasAge55OrOlder ? group.jobsAge55OrOlder : null,
      jobsEarnings1250OrLess: group.hasEarnings1250OrLess
        ? group.jobsEarnings1250OrLess
        : null,
      jobsEarnings1251To3333: group.hasEarnings1251To3333
        ? group.jobsEarnings1251To3333
        : null,
      jobsEarnings3333Plus: group.hasEarnings3333Plus
        ? group.jobsEarnings3333Plus
        : null,
      raw: {
        aggregatedRows: group.sourceRows,
        sourceGeography: "census_block",
        storedGeography: "county_pair",
      },
    }));
}

async function streamCensusLehdLodesRows(
  response: Response,
  sourceUrl: string,
  accumulator: LodesAccumulator,
) {
  if (!response.body) {
    throw new Error("Census LEHD LODES response did not include a body.");
  }

  const parser = parseCsvStream({
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const sink = new Writable({
    objectMode: true,
    write(row: CensusLehdLodesRow, _encoding, callback) {
      try {
        addCensusLehdLodesRow(row, accumulator);
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  const readable = Readable.fromWeb(response.body as never);

  const isGzip = response.url.endsWith(".gz") || sourceUrl.endsWith(".gz");
  if (isGzip) {
    await pipeline(readable, createGunzip(), parser, sink);
  } else {
    await pipeline(readable, parser, sink);
  }
}

function createLodesAccumulator(
  counties: CensusLehdLodesCounty[],
): LodesAccumulator {
  return {
    rowsRead: 0,
    countyLookup: createTargetCountyLookup(counties),
    groups: new Map(),
  };
}

function createFlowAccumulator(
  input: Pick<
    CensusLehdLodesFlowAccumulator,
    | "homeStateFips"
    | "homeCountyFips"
    | "homeCountyName"
    | "workStateFips"
    | "workCountyFips"
    | "workCountyName"
    | "flowKind"
  >,
): CensusLehdLodesFlowAccumulator {
  return {
    ...input,
    totalJobs: 0,
    jobsAge29OrYounger: 0,
    jobsAge30To54: 0,
    jobsAge55OrOlder: 0,
    jobsEarnings1250OrLess: 0,
    jobsEarnings1251To3333: 0,
    jobsEarnings3333Plus: 0,
    hasAge29OrYounger: false,
    hasAge30To54: false,
    hasAge55OrOlder: false,
    hasEarnings1250OrLess: false,
    hasEarnings1251To3333: false,
    hasEarnings3333Plus: false,
    sourceRows: 0,
  };
}

function assertLodesRowShape(row: CensusLehdLodesRow) {
  for (const field of ["w_geocode", "h_geocode", "S000"] as const) {
    if (!(field in row) || row[field] === undefined) {
      throw new Error(`Census LEHD LODES row missing field: ${field}`);
    }
  }
}

function parseBlockCounty(value: string, label: "home" | "work") {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 5) {
    throw new Error(`Census LEHD LODES ${label} geocode is malformed: ${value}`);
  }
  return {
    stateFips: digits.slice(0, 2),
    countyFips: digits.slice(2, 5),
  };
}

function createTargetCountyLookup(counties: CensusLehdLodesCounty[]) {
  if (counties.length === 0) {
    throw new Error("Census LEHD LODES config needs counties.");
  }

  return new Map(
    counties.map((county) => [
      countyKey(normalizeFips(county.state, 2), normalizeFips(county.county, 3)),
      county.label,
    ]),
  );
}

function countyKey(stateFips: string, countyFips: string) {
  return `${stateFips}${countyFips}`;
}

function getFlowKind(
  homeKey: string,
  workKey: string,
  homeIsTarget: boolean,
  workIsTarget: boolean,
) {
  if (homeIsTarget && workIsTarget && homeKey === workKey) {
    return "within_target_county";
  }
  if (homeIsTarget && workIsTarget) {
    return "between_target_counties";
  }
  if (homeIsTarget) {
    return "resident_work_destination";
  }
  return "worker_home_origin";
}

function addOptionalCount<
  TValueKey extends
    | "jobsAge29OrYounger"
    | "jobsAge30To54"
    | "jobsAge55OrOlder"
    | "jobsEarnings1250OrLess"
    | "jobsEarnings1251To3333"
    | "jobsEarnings3333Plus",
  THasKey extends
    | "hasAge29OrYounger"
    | "hasAge30To54"
    | "hasAge55OrOlder"
    | "hasEarnings1250OrLess"
    | "hasEarnings1251To3333"
    | "hasEarnings3333Plus",
>(
  group: CensusLehdLodesFlowAccumulator,
  valueKey: TValueKey,
  hasKey: THasKey,
  value: string | undefined,
) {
  const parsed = parseOptionalInteger(value);
  if (parsed !== null) {
    group[valueKey] += parsed;
    group[hasKey] = true;
  }
}

function parseRequiredInteger(value: string, field: string) {
  const parsed = parseOptionalInteger(value);
  if (parsed === null) {
    throw new Error(`Census LEHD LODES row has invalid integer: ${field}`);
  }
  return parsed;
}

function parseOptionalInteger(value: string | undefined) {
  const cleaned = String(value ?? "").replace(/,/g, "").trim();
  if (!cleaned || ["-", "**", "***", "null"].includes(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census LEHD LODES FIPS code is missing.");
  }
  return digits.padStart(length, "0").slice(-length);
}

export type CensusLehdLodesRow = Record<string, string>;
