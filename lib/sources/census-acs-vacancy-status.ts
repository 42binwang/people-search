import {
  upsertAggregateVacancyStatusMetric,
  upsertApprovedSource,
  type AggregateVacancyStatusMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_VACANCY_STATUS_VARIABLES = {
  totalVacantUnits: "B25004_001E",
  forRentUnits: "B25004_002E",
  rentedNotOccupiedUnits: "B25004_003E",
  forSaleOnlyUnits: "B25004_004E",
  soldNotOccupiedUnits: "B25004_005E",
  seasonalRecreationalOccasionalUnits: "B25004_006E",
  migrantWorkerUnits: "B25004_007E",
  otherVacantUnits: "B25004_008E",
} as const;

export type CensusAcsVacancyStatusCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsVacancyStatusInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsVacancyStatusCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsVacancyStatusIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsVacancyStatus(
  input: CensusAcsVacancyStatusInput,
): Promise<CensusAcsVacancyStatusIngestResult> {
  registerCensusAcsVacancyStatusSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS vacancy status ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsVacancyStatusUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsVacancyStatusIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS vacancy status request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsVacancyStatusResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateVacancyStatusMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsVacancyStatusSource(
  input: CensusAcsVacancyStatusInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate vacancy status",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year detailed table B25004 aggregate vacancy status estimates. This source contains aggregate county-level estimates only and must not be used as individual address, occupancy, or residence evidence.",
  });
}

export function buildCensusAcsVacancyStatusUrl(input: {
  year: number;
  county: Pick<CensusAcsVacancyStatusCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(`https://api.census.gov/data/${input.year}/acs/acs5`);
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_VACANCY_STATUS_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsVacancyStatusResponse(
  payload: unknown,
  input: Pick<CensusAcsVacancyStatusInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsVacancyStatusCounty,
): AggregateVacancyStatusMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS vacancy status response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS vacancy status response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsVacancyStatusRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsVacancyStatusRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsVacancyStatusInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsVacancyStatusCounty,
): AggregateVacancyStatusMetricInput {
  const getValue = createCensusVacancyStatusRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;
  const totalVacantUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.totalVacantUnits),
  );
  const forRentUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.forRentUnits),
  );
  const rentedNotOccupiedUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.rentedNotOccupiedUnits),
  );
  const forSaleOnlyUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.forSaleOnlyUnits),
  );
  const soldNotOccupiedUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.soldNotOccupiedUnits),
  );
  const seasonalRecreationalOccasionalUnits = parseCensusInteger(
    getValue(
      CENSUS_ACS_VACANCY_STATUS_VARIABLES
        .seasonalRecreationalOccasionalUnits,
    ),
  );
  const migrantWorkerUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.migrantWorkerUnits),
  );
  const otherVacantUnits = parseCensusInteger(
    getValue(CENSUS_ACS_VACANCY_STATUS_VARIABLES.otherVacantUnits),
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    totalVacantUnits,
    forRentUnits,
    forRentPct: computePct(forRentUnits, totalVacantUnits),
    rentedNotOccupiedUnits,
    rentedNotOccupiedPct: computePct(
      rentedNotOccupiedUnits,
      totalVacantUnits,
    ),
    forSaleOnlyUnits,
    forSaleOnlyPct: computePct(forSaleOnlyUnits, totalVacantUnits),
    soldNotOccupiedUnits,
    soldNotOccupiedPct: computePct(soldNotOccupiedUnits, totalVacantUnits),
    seasonalRecreationalOccasionalUnits,
    seasonalRecreationalOccasionalPct: computePct(
      seasonalRecreationalOccasionalUnits,
      totalVacantUnits,
    ),
    migrantWorkerUnits,
    migrantWorkerPct: computePct(migrantWorkerUnits, totalVacantUnits),
    otherVacantUnits,
    otherVacantPct: computePct(otherVacantUnits, totalVacantUnits),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusVacancyStatusRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_VACANCY_STATUS_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS vacancy status response missing field: ${field}`,
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
    throw new Error("Census ACS vacancy status response was not valid JSON.");
  }
}

function parseCensusInteger(value: string) {
  if (!value || ["-", "**", "***", "null"].includes(value)) {
    return null;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function computePct(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census ACS vacancy status geography FIPS code is missing.");
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
