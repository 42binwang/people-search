import {
  upsertAggregateMobilityMetric,
  upsertApprovedSource,
  type AggregateMobilityMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_MOBILITY_VARIABLES = {
  totalPopulationOneYearOver: "DP02_0079E",
  sameHouse: "DP02_0080E",
  differentHouse: "DP02_0081E",
  differentHouseUs: "DP02_0082E",
  movedWithinSameCounty: "DP02_0083E",
  movedDifferentCounty: "DP02_0084E",
  movedDifferentCountySameState: "DP02_0085E",
  movedDifferentState: "DP02_0086E",
  movedFromAbroad: "DP02_0087E",
  sameHousePct: "DP02_0080PE",
  differentHousePct: "DP02_0081PE",
  movedWithinSameCountyPct: "DP02_0083PE",
  movedDifferentCountySameStatePct: "DP02_0085PE",
  movedDifferentStatePct: "DP02_0086PE",
  movedFromAbroadPct: "DP02_0087PE",
} as const;

export type CensusAcsMobilityGeography = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsMobilityInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  geographies: CensusAcsMobilityGeography[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsMobilityIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsMobility(
  input: CensusAcsMobilityInput,
): Promise<CensusAcsMobilityIngestResult> {
  registerCensusAcsMobilitySource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS mobility ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const geography of input.geographies) {
    const url = buildCensusAcsMobilityUrl({
      year: input.year,
      geography,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchCensusAcsMobilityIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS mobility request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseCensusJson(response);
    const metrics = parseCensusAcsMobilityResponse(payload, input, geography);
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateMobilityMetric(metric);
      imported += 1;
    }
  }

  return {
    fetched,
    imported,
    urls,
  };
}

export function registerCensusAcsMobilitySource(input: CensusAcsMobilityInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate residential mobility statistics",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP02 aggregate residence-one-year-ago estimates. This source contains aggregate county-level estimates only and must not be used as individual residence evidence.",
  });
}

export function buildCensusAcsMobilityUrl(input: {
  year: number;
  geography: Pick<CensusAcsMobilityGeography, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_MOBILITY_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.geography.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.geography.state, 2)}`);
  url.searchParams.set("key", input.apiKey);

  return url.toString();
}

export function parseCensusAcsMobilityResponse(
  payload: unknown,
  input: Pick<CensusAcsMobilityInput, "sourceId" | "hub" | "year">,
  requestedGeography: CensusAcsMobilityGeography,
): AggregateMobilityMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error("Census ACS mobility response did not include data rows.");
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS mobility response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsMobilityRow(header, row, input, requestedGeography),
  );
}

export function mapCensusAcsMobilityRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsMobilityInput, "sourceId" | "hub" | "year">,
  requestedGeography: CensusAcsMobilityGeography,
): AggregateMobilityMetricInput {
  const getValue = createCensusRowGetter(header, row);
  const state = normalizeFips(getValue("state") || requestedGeography.state, 2);
  const county = normalizeFips(getValue("county") || requestedGeography.county, 3);
  const geoId = `${state}${county}`;
  const name = getValue("NAME") || requestedGeography.label;

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${geoId}`,
    year: input.year,
    geographyLevel: "county",
    geoId,
    name,
    hub: input.hub,
    state,
    county,
    totalPopulationOneYearOver: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.totalPopulationOneYearOver),
    ),
    sameHouse: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.sameHouse),
    ),
    differentHouse: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.differentHouse),
    ),
    differentHouseUs: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.differentHouseUs),
    ),
    movedWithinSameCounty: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedWithinSameCounty),
    ),
    movedDifferentCounty: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentCounty),
    ),
    movedDifferentCountySameState: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentCountySameState),
    ),
    movedDifferentState: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentState),
    ),
    movedFromAbroad: parseCensusInteger(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedFromAbroad),
    ),
    sameHousePct: parseCensusNumber(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.sameHousePct),
    ),
    differentHousePct: parseCensusNumber(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.differentHousePct),
    ),
    movedWithinSameCountyPct: parseCensusNumber(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedWithinSameCountyPct),
    ),
    movedDifferentCountySameStatePct: parseCensusNumber(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentCountySameStatePct),
    ),
    movedDifferentStatePct: parseCensusNumber(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedDifferentStatePct),
    ),
    movedFromAbroadPct: parseCensusNumber(
      getValue(CENSUS_ACS_MOBILITY_VARIABLES.movedFromAbroadPct),
    ),
    raw: Object.fromEntries(header.map((field, index) => [field, row[index] ?? null])),
  };
}

function createCensusRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_MOBILITY_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(`Census ACS mobility response missing field: ${field}`);
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
    throw new Error("Census ACS mobility response was not valid JSON.");
  }
}

function parseCensusInteger(value: string) {
  const parsed = parseCensusNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function parseCensusNumber(value: string) {
  if (!value || ["-", "**", "***", "null"].includes(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFips(value: string, length: number) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census ACS mobility geography FIPS code is missing.");
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
