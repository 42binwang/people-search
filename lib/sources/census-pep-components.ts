import { parse } from "csv-parse/sync";
import {
  upsertAggregatePopulationChangeMetric,
  upsertApprovedSource,
  type AggregatePopulationChangeMetricInput,
} from "@/lib/db";

export type CensusPepComponentsCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusPepComponentsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  vintage: number;
  url: string;
  years: number[];
  counties: CensusPepComponentsCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
};

export type CensusPepComponentsIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestCensusPepComponents(
  input: CensusPepComponentsInput,
): Promise<CensusPepComponentsIngestResult> {
  registerCensusPepComponentsSource(input);

  const response = await fetch(input.url, {
    headers: {
      accept: "text/csv,text/plain,*/*;q=0.5",
      "user-agent": "PeopleSearchCensusPepComponentsIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Census PEP components request failed: ${response.status} ${response.statusText}`,
    );
  }

  const rows = parseCensusPepComponentsCsv(await response.text());
  const metrics = mapCensusPepComponentRows(rows, input);

  for (const metric of metrics) {
    upsertAggregatePopulationChangeMetric(metric);
  }

  return {
    fetched: rows.length,
    imported: metrics.length,
    url: input.url,
  };
}

export function registerCensusPepComponentsSource(
  input: CensusPepComponentsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate population change components",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_bulk_file",
    licenseUrl:
      input.licenseUrl ??
      "https://www.census.gov/data/tables/time-series/demo/popest/2020s-counties-total.html",
    notes:
      input.notes ??
      "U.S. Census Population Estimates Program county population totals and components of change. Aggregate county-year estimates only; do not use as individual residence evidence.",
  });
}

export function parseCensusPepComponentsCsv(
  text: string,
): CensusPepComponentsRow[] {
  const rows = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CensusPepComponentsRow[];

  if (rows.length === 0) {
    throw new Error("Census PEP components CSV did not include data rows.");
  }

  return rows;
}

export function mapCensusPepComponentRows(
  rows: CensusPepComponentsRow[],
  input: Pick<
    CensusPepComponentsInput,
    "sourceId" | "hub" | "vintage" | "years" | "counties"
  >,
): AggregatePopulationChangeMetricInput[] {
  const targetCountyKeys = new Set(
    input.counties.map((county) =>
      countyKey(normalizeFips(county.state, 2), normalizeFips(county.county, 3)),
    ),
  );

  return rows
    .filter((row) => row.SUMLEV === "050")
    .filter((row) =>
      targetCountyKeys.has(
        countyKey(normalizeFips(row.STATE, 2), normalizeFips(row.COUNTY, 3)),
      ),
    )
    .flatMap((row) => input.years.map((year) => mapCensusPepComponentRow(row, year, input)));
}

export function mapCensusPepComponentRow(
  row: CensusPepComponentsRow,
  year: number,
  input: Pick<CensusPepComponentsInput, "sourceId" | "hub" | "vintage">,
): AggregatePopulationChangeMetricInput {
  assertCensusPepRowShape(row, year);

  const stateFips = normalizeFips(row.STATE, 2);
  const countyFips = normalizeFips(row.COUNTY, 3);
  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.vintage}-${stateFips}${countyFips}-${year}`,
    hub: input.hub,
    year,
    stateFips,
    countyFips,
    countyName: clean(row.CTYNAME),
    stateName: clean(row.STNAME),
    populationEstimate: parsePepInteger(row[`POPESTIMATE${year}`]),
    netPopulationChange: parsePepInteger(row[`NPOPCHG${year}`]),
    births: parsePepInteger(row[`BIRTHS${year}`]),
    deaths: parsePepInteger(row[`DEATHS${year}`]),
    naturalChange: parsePepInteger(row[`NATURALCHG${year}`]),
    internationalMigration: parsePepInteger(row[`INTERNATIONALMIG${year}`]),
    domesticMigration: parsePepInteger(row[`DOMESTICMIG${year}`]),
    netMigration: parsePepInteger(row[`NETMIG${year}`]),
    residual: parsePepInteger(row[`RESIDUAL${year}`]),
    domesticMigrationRate: parsePepNumber(row[`RDOMESTICMIG${year}`]),
    internationalMigrationRate: parsePepNumber(row[`RINTERNATIONALMIG${year}`]),
    netMigrationRate: parsePepNumber(row[`RNETMIG${year}`]),
    raw: row,
  };
}

function assertCensusPepRowShape(row: CensusPepComponentsRow, year: number) {
  const required = [
    "SUMLEV",
    "STATE",
    "COUNTY",
    "STNAME",
    "CTYNAME",
    `POPESTIMATE${year}`,
    `NPOPCHG${year}`,
    `BIRTHS${year}`,
    `DEATHS${year}`,
    `NATURALCHG${year}`,
    `INTERNATIONALMIG${year}`,
    `DOMESTICMIG${year}`,
    `NETMIG${year}`,
    `RESIDUAL${year}`,
    `RINTERNATIONALMIG${year}`,
    `RDOMESTICMIG${year}`,
    `RNETMIG${year}`,
  ];

  for (const field of required) {
    if (!(field in row) || row[field] === undefined) {
      throw new Error(`Census PEP components row missing field: ${field}`);
    }
  }
}

function parsePepInteger(value: string) {
  const parsed = parsePepNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function parsePepNumber(value: string) {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned || ["-", "**", "***", "null"].includes(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function countyKey(state: string, county: string) {
  return `${state}${county}`;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census PEP components FIPS code is missing.");
  }
  return digits.padStart(length, "0").slice(-length);
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export type CensusPepComponentsRow = Record<string, string>;
