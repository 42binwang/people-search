import {
  upsertAggregateMigrationFlow,
  upsertApprovedSource,
  type AggregateMigrationFlowInput,
} from "@/lib/db";

export const CENSUS_ACS_FLOW_VARIABLES = {
  referenceName: "FULL1_NAME",
  secondName: "FULL2_NAME",
  referenceGeoId: "GEOID1",
  secondGeoId: "GEOID2",
  movedIn: "MOVEDIN",
  movedInMargin: "MOVEDIN_M",
  movedOut: "MOVEDOUT",
  movedOutMargin: "MOVEDOUT_M",
  movedNet: "MOVEDNET",
  movedNetMargin: "MOVEDNET_M",
  referenceState: "STATE1",
  referenceCounty: "COUNTY1",
  secondState: "STATE2",
  secondCounty: "COUNTY2",
} as const;

export type CensusAcsMigrationFlowCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsMigrationFlowsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  periodLabel: string;
  counties: CensusAcsMigrationFlowCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsMigrationFlowsIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsMigrationFlows(
  input: CensusAcsMigrationFlowsInput,
): Promise<CensusAcsMigrationFlowsIngestResult> {
  registerCensusAcsMigrationFlowsSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS migration-flow ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsMigrationFlowsUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchCensusAcsMigrationFlowsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS migration-flow request failed: ${response.status} ${response.statusText}`,
      );
    }

    const flows = parseCensusAcsMigrationFlowsResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += flows.length;

    for (const flow of flows) {
      upsertAggregateMigrationFlow(flow);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsMigrationFlowsSource(
  input: CensusAcsMigrationFlowsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate county migration flows",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-migration-flows.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year migration-flow API. Aggregate estimates only; do not use as individual residence evidence.",
  });
}

export function buildCensusAcsMigrationFlowsUrl(input: {
  year: number;
  county: Pick<CensusAcsMigrationFlowCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(`https://api.census.gov/data/${input.year}/acs/flows`);
  url.searchParams.set(
    "get",
    [
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
    ].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsMigrationFlowsResponse(
  payload: unknown,
  input: Pick<
    CensusAcsMigrationFlowsInput,
    "sourceId" | "hub" | "year" | "periodLabel"
  >,
  referenceCounty: CensusAcsMigrationFlowCounty,
): AggregateMigrationFlowInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error("Census ACS migration-flow response did not include data rows.");
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS migration-flow response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsMigrationFlowRow(header, row, input, referenceCounty),
  );
}

export function mapCensusAcsMigrationFlowRow(
  header: string[],
  row: string[],
  input: Pick<
    CensusAcsMigrationFlowsInput,
    "sourceId" | "hub" | "year" | "periodLabel"
  >,
  referenceCounty: CensusAcsMigrationFlowCounty,
): AggregateMigrationFlowInput {
  const getValue = createCensusFlowRowGetter(header, row);
  const originGeoId = normalizeGeoId(
    getValue(CENSUS_ACS_FLOW_VARIABLES.secondGeoId),
  );
  const destinationGeoId = normalizeGeoId(
    getValue(CENSUS_ACS_FLOW_VARIABLES.referenceGeoId),
  );
  const originStateFips = originGeoId.slice(0, 2);
  const originCountyFips = originGeoId.slice(2, 5);
  const destinationStateFips = destinationGeoId.slice(0, 2);
  const destinationCountyFips = destinationGeoId.slice(2, 5);
  const flowKind = originGeoId === destinationGeoId ? "non_movers" : "county_to_county";

  return {
    sourceId: input.sourceId,
    sourceRecordId: [
      input.periodLabel,
      "acs-flow",
      originGeoId,
      destinationGeoId,
      flowKind,
    ].join("-"),
    yearStart: input.year - 4,
    yearEnd: input.year,
    hub: input.hub,
    flowDirection: "inflow",
    flowKind,
    originStateFips,
    originCountyFips,
    originName:
      clean(getValue(CENSUS_ACS_FLOW_VARIABLES.secondName)) ||
      referenceCounty.label,
    destinationStateFips,
    destinationCountyFips,
    destinationName:
      clean(getValue(CENSUS_ACS_FLOW_VARIABLES.referenceName)) ||
      referenceCounty.label,
    returnsCount: null,
    individualsCount: parseCensusInteger(
      getValue(CENSUS_ACS_FLOW_VARIABLES.movedIn),
    ),
    adjustedGrossIncome: null,
    raw: Object.fromEntries(header.map((field, index) => [field, row[index] ?? null])),
  };
}

function createCensusFlowRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
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
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(`Census ACS migration-flow response missing field: ${field}`);
    }
  }

  return (field: string) => {
    const index = fieldIndexes.get(field);
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };
}

async function parseCensusJson(response: Response): Promise<CensusResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as CensusResponse;
  } catch {
    throw new Error("Census ACS migration-flow response was not valid JSON.");
  }
}

function parseCensusInteger(value: string) {
  if (!value || ["-", "**", "***", "null"].includes(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeGeoId(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5) {
    throw new Error(`Census ACS migration-flow GEOID is malformed: ${value}`);
  }
  return digits.slice(-5);
}

function normalizeFips(value: string, length: number) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census ACS migration-flow geography FIPS code is missing.");
  }
  return digits.padStart(length, "0").slice(-length);
}

function redactApiKey(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has("key")) {
    parsed.searchParams.set("key", "REDACTED");
  }
  return parsed.toString();
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
