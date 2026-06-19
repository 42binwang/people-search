import {
  upsertAggregateHousingCrowdingMetric,
  upsertApprovedSource,
  type AggregateHousingCrowdingMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HOUSING_CROWDING_VARIABLES = {
  occupiedHousingUnits: "DP04_0076E",
  occupantsPerRoomOneOrLess: "DP04_0077E",
  occupantsPerRoomOneOrLessPct: "DP04_0077PE",
  occupantsPerRoomOneToOnePointFive: "DP04_0078E",
  occupantsPerRoomOneToOnePointFivePct: "DP04_0078PE",
  occupantsPerRoomOnePointFivePlus: "DP04_0079E",
  occupantsPerRoomOnePointFivePlusPct: "DP04_0079PE",
} as const;

export type CensusAcsHousingCrowdingCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHousingCrowdingInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHousingCrowdingCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHousingCrowdingIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHousingCrowding(
  input: CensusAcsHousingCrowdingInput,
): Promise<CensusAcsHousingCrowdingIngestResult> {
  registerCensusAcsHousingCrowdingSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS housing crowding ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHousingCrowdingUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsHousingCrowdingIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS housing crowding request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHousingCrowdingResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHousingCrowdingMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHousingCrowdingSource(
  input: CensusAcsHousingCrowdingInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate housing crowding",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP04 aggregate occupants-per-room estimates. This source contains aggregate county-level estimates only and must not be used as individual household-size, occupancy, or residence evidence.",
  });
}

export function buildCensusAcsHousingCrowdingUrl(input: {
  year: number;
  county: Pick<CensusAcsHousingCrowdingCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HOUSING_CROWDING_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHousingCrowdingResponse(
  payload: unknown,
  input: Pick<CensusAcsHousingCrowdingInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingCrowdingCounty,
): AggregateHousingCrowdingMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS housing crowding response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS housing crowding response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsHousingCrowdingRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHousingCrowdingRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHousingCrowdingInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingCrowdingCounty,
): AggregateHousingCrowdingMetricInput {
  const getValue = createCensusHousingCrowdingRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;
  const oneToOnePointFive = parseCensusInteger(
    getValue(
      CENSUS_ACS_HOUSING_CROWDING_VARIABLES
        .occupantsPerRoomOneToOnePointFive,
    ),
  );
  const onePointFivePlus = parseCensusInteger(
    getValue(
      CENSUS_ACS_HOUSING_CROWDING_VARIABLES
        .occupantsPerRoomOnePointFivePlus,
    ),
  );
  const oneToOnePointFivePct = parseCensusNumber(
    getValue(
      CENSUS_ACS_HOUSING_CROWDING_VARIABLES
        .occupantsPerRoomOneToOnePointFivePct,
    ),
  );
  const onePointFivePlusPct = parseCensusNumber(
    getValue(
      CENSUS_ACS_HOUSING_CROWDING_VARIABLES
        .occupantsPerRoomOnePointFivePlusPct,
    ),
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    occupiedHousingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupiedHousingUnits),
    ),
    occupantsPerRoomOneOrLess: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOneOrLess,
      ),
    ),
    occupantsPerRoomOneOrLessPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSING_CROWDING_VARIABLES.occupantsPerRoomOneOrLessPct,
      ),
    ),
    occupantsPerRoomOneToOnePointFive: oneToOnePointFive,
    occupantsPerRoomOneToOnePointFivePct: oneToOnePointFivePct,
    occupantsPerRoomOnePointFivePlus: onePointFivePlus,
    occupantsPerRoomOnePointFivePlusPct: onePointFivePlusPct,
    overcrowdedUnits: sumNullable(oneToOnePointFive, onePointFivePlus),
    overcrowdedPct: sumNullable(oneToOnePointFivePct, onePointFivePlusPct),
    severeOvercrowdedUnits: onePointFivePlus,
    severeOvercrowdedPct: onePointFivePlusPct,
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusHousingCrowdingRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HOUSING_CROWDING_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS housing crowding response missing field: ${field}`,
      );
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
    throw new Error("Census ACS housing crowding response was not valid JSON.");
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
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sumNullable(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return null;
  }
  return roundOneDecimal((left ?? 0) + (right ?? 0));
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census ACS housing crowding geography FIPS code is missing.");
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
