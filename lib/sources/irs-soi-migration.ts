import { parse } from "csv-parse/sync";
import {
  upsertAggregateMigrationFlow,
  upsertApprovedSource,
  type AggregateMigrationFlowInput,
} from "@/lib/db";

export type IrsSoiMigrationCounty = {
  label: string;
  state: string;
  county: string;
};

export type IrsSoiMigrationInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  yearStart: number;
  yearEnd: number;
  inflowUrl: string;
  outflowUrl: string;
  counties: IrsSoiMigrationCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
};

export type IrsSoiMigrationIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

export async function ingestIrsSoiMigrationFlows(
  input: IrsSoiMigrationInput,
): Promise<IrsSoiMigrationIngestResult> {
  registerIrsSoiMigrationSource(input);

  const urls = [input.inflowUrl, input.outflowUrl];
  let fetched = 0;
  let imported = 0;

  for (const direction of ["inflow", "outflow"] as const) {
    const url = direction === "inflow" ? input.inflowUrl : input.outflowUrl;
    const response = await fetch(url, {
      headers: {
        accept: "text/csv,text/plain,*/*;q=0.5",
        "user-agent": "PeopleSearchIrsSoiMigrationIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `IRS SOI migration ${direction} request failed: ${response.status} ${response.statusText}`,
      );
    }

    const rows = parseIrsSoiMigrationCsv(await response.text());
    const flows = mapIrsSoiMigrationRows(rows, direction, input);
    fetched += flows.length;

    for (const flow of flows) {
      upsertAggregateMigrationFlow(flow);
      imported += 1;
    }
  }

  return {
    fetched,
    imported,
    urls,
  };
}

export function registerIrsSoiMigrationSource(input: IrsSoiMigrationInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate county migration flows",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_bulk_file",
    licenseUrl:
      input.licenseUrl ??
      "https://www.irs.gov/statistics/soi-tax-stats-migration-data",
    notes:
      input.notes ??
      "IRS Statistics of Income county-to-county migration files. Aggregate tax-return movement counts only; do not use as individual residence evidence.",
  });
}

export function parseIrsSoiMigrationCsv(text: string): IrsSoiMigrationRow[] {
  const rows = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as IrsSoiMigrationRow[];

  if (rows.length === 0) {
    throw new Error("IRS SOI migration CSV did not include data rows.");
  }

  return rows;
}

export function mapIrsSoiMigrationRows(
  rows: IrsSoiMigrationRow[],
  direction: "inflow" | "outflow",
  input: Pick<
    IrsSoiMigrationInput,
    "sourceId" | "hub" | "yearStart" | "yearEnd" | "counties"
  >,
) {
  const targetCountyKeys = new Set(
    input.counties.map((county) =>
      countyKey(normalizeFips(county.state, 2), normalizeFips(county.county, 3)),
    ),
  );

  return rows
    .filter((row) => rowMatchesTargetCounty(row, direction, targetCountyKeys))
    .map((row) => mapIrsSoiMigrationRow(row, direction, input));
}

export function mapIrsSoiMigrationRow(
  row: IrsSoiMigrationRow,
  direction: "inflow" | "outflow",
  input: Pick<
    IrsSoiMigrationInput,
    "sourceId" | "hub" | "yearStart" | "yearEnd" | "counties"
  >,
): AggregateMigrationFlowInput {
  assertIrsRowShape(row, direction);

  const originStateFips =
    direction === "inflow"
      ? normalizeFips(row.y1_statefips, 2)
      : normalizeFips(row.y1_statefips, 2);
  const originCountyFips =
    direction === "inflow"
      ? normalizeFips(row.y1_countyfips, 3)
      : normalizeFips(row.y1_countyfips, 3);
  const destinationStateFips =
    direction === "inflow"
      ? normalizeFips(row.y2_statefips, 2)
      : normalizeFips(row.y2_statefips, 2);
  const destinationCountyFips =
    direction === "inflow"
      ? normalizeFips(row.y2_countyfips, 3)
      : normalizeFips(row.y2_countyfips, 3);
  const rowName =
    direction === "inflow"
      ? clean(row.y1_countyname)
      : clean(row.y2_countyname);
  const targetLabels = new Map(
    input.counties.map((county) => [
      countyKey(normalizeFips(county.state, 2), normalizeFips(county.county, 3)),
      county.label,
    ]),
  );
  const targetName =
    targetLabels.get(
      countyKey(
        direction === "inflow" ? destinationStateFips : originStateFips,
        direction === "inflow" ? destinationCountyFips : originCountyFips,
      ),
    ) ?? `County ${direction === "inflow" ? destinationStateFips : originStateFips}${direction === "inflow" ? destinationCountyFips : originCountyFips}`;
  const originName =
    direction === "inflow"
      ? rowName
      : targetName;
  const destinationName =
    direction === "inflow"
      ? targetName
      : rowName;
  const flowKind = getIrsFlowKind(
    direction === "inflow" ? originStateFips : destinationStateFips,
    direction === "inflow" ? originCountyFips : destinationCountyFips,
    rowName,
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: [
      input.yearStart,
      input.yearEnd,
      direction,
      originStateFips,
      originCountyFips,
      destinationStateFips,
      destinationCountyFips,
      flowKind,
    ].join("-"),
    yearStart: input.yearStart,
    yearEnd: input.yearEnd,
    hub: input.hub,
    flowDirection: direction,
    flowKind,
    originStateFips,
    originCountyFips,
    originName,
    destinationStateFips,
    destinationCountyFips,
    destinationName,
    returnsCount: parseIrsInteger(row.n1),
    individualsCount: parseIrsInteger(row.n2),
    adjustedGrossIncome: parseIrsInteger(row.agi),
    raw: row,
  };
}

function rowMatchesTargetCounty(
  row: IrsSoiMigrationRow,
  direction: "inflow" | "outflow",
  targetCountyKeys: Set<string>,
) {
  assertIrsRowShape(row, direction);

  const state =
    direction === "inflow"
      ? normalizeFips(row.y2_statefips, 2)
      : normalizeFips(row.y1_statefips, 2);
  const county =
    direction === "inflow"
      ? normalizeFips(row.y2_countyfips, 3)
      : normalizeFips(row.y1_countyfips, 3);

  return targetCountyKeys.has(countyKey(state, county));
}

function assertIrsRowShape(
  row: IrsSoiMigrationRow,
  direction: "inflow" | "outflow",
) {
  const required =
    direction === "inflow"
      ? [
          "y2_statefips",
          "y2_countyfips",
          "y1_statefips",
          "y1_countyfips",
          "y1_state",
          "y1_countyname",
          "n1",
          "n2",
          "agi",
        ]
      : [
          "y1_statefips",
          "y1_countyfips",
          "y2_statefips",
          "y2_countyfips",
          "y2_state",
          "y2_countyname",
          "n1",
          "n2",
          "agi",
        ];

  for (const field of required) {
    if (!(field in row) || row[field] === undefined) {
      throw new Error(`IRS SOI migration row missing field: ${field}`);
    }
  }
}

function getIrsFlowKind(stateFips: string, countyFips: string, name: string) {
  const normalizedName = clean(name).toLowerCase();
  if (stateFips === "96" && countyFips === "000") {
    return "total_us_and_foreign";
  }
  if (stateFips === "97" && countyFips === "000") {
    return "total_us";
  }
  if (stateFips === "97" && countyFips === "001") {
    return "total_same_state";
  }
  if (stateFips === "97" && countyFips === "003") {
    return "total_different_state";
  }
  if (stateFips === "98" && countyFips === "000") {
    return "total_foreign";
  }
  if (normalizedName.includes("non-migrants")) {
    return "non_migrants";
  }
  return "county_to_county";
}

function parseIrsInteger(value: string) {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned || ["-", "**", "***"].includes(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function countyKey(state: string, county: string) {
  return `${state}${county}`;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("IRS SOI migration FIPS code is missing.");
  }
  return digits.padStart(length, "0").slice(-length);
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export type IrsSoiMigrationRow = Record<string, string>;
