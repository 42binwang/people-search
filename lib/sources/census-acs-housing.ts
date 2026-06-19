import {
  upsertAggregateHousingStockMetric,
  upsertApprovedSource,
  type AggregateHousingStockMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HOUSING_VARIABLES = {
  totalHousingUnits: "DP04_0001E",
  occupiedHousingUnits: "DP04_0002E",
  vacantHousingUnits: "DP04_0003E",
  occupiedHousingPct: "DP04_0002PE",
  vacantHousingPct: "DP04_0003PE",
  homeownerVacancyRate: "DP04_0004E",
  rentalVacancyRate: "DP04_0005E",
  ownerOccupiedUnits: "DP04_0046E",
  renterOccupiedUnits: "DP04_0047E",
  ownerOccupiedPct: "DP04_0046PE",
  renterOccupiedPct: "DP04_0047PE",
  medianHomeValue: "DP04_0089E",
  medianGrossRent: "DP04_0134E",
} as const;

export type CensusAcsHousingCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHousingInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHousingCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHousingIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHousing(
  input: CensusAcsHousingInput,
): Promise<CensusAcsHousingIngestResult> {
  registerCensusAcsHousingSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS housing ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHousingUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchCensusAcsHousingIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS housing request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHousingResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHousingStockMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHousingSource(input: CensusAcsHousingInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate housing stock characteristics",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP04 aggregate housing stock, occupancy, vacancy, and tenure estimates. This source contains aggregate county-level estimates only and must not be used as individual residence evidence.",
  });
}

export function buildCensusAcsHousingUrl(input: {
  year: number;
  county: Pick<CensusAcsHousingCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HOUSING_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHousingResponse(
  payload: unknown,
  input: Pick<CensusAcsHousingInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingCounty,
): AggregateHousingStockMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error("Census ACS housing response did not include data rows.");
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS housing response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsHousingRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHousingRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHousingInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingCounty,
): AggregateHousingStockMetricInput {
  const getValue = createCensusHousingRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    totalHousingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.totalHousingUnits),
    ),
    occupiedHousingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.occupiedHousingUnits),
    ),
    vacantHousingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.vacantHousingUnits),
    ),
    occupiedHousingPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.occupiedHousingPct),
    ),
    vacantHousingPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.vacantHousingPct),
    ),
    homeownerVacancyRate: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.homeownerVacancyRate),
    ),
    rentalVacancyRate: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.rentalVacancyRate),
    ),
    ownerOccupiedUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.ownerOccupiedUnits),
    ),
    renterOccupiedUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.renterOccupiedUnits),
    ),
    ownerOccupiedPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.ownerOccupiedPct),
    ),
    renterOccupiedPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.renterOccupiedPct),
    ),
    medianHomeValue: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.medianHomeValue),
    ),
    medianGrossRent: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_VARIABLES.medianGrossRent),
    ),
    raw: Object.fromEntries(header.map((field, index) => [field, row[index] ?? null])),
  };
}

function createCensusHousingRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HOUSING_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(`Census ACS housing response missing field: ${field}`);
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
    throw new Error("Census ACS housing response was not valid JSON.");
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
    throw new Error("Census ACS housing geography FIPS code is missing.");
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
