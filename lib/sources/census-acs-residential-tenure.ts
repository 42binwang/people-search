import {
  upsertAggregateResidentialTenureMetric,
  upsertApprovedSource,
  type AggregateResidentialTenureMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES = {
  occupiedHousingUnits: "DP04_0050E",
  moved2023OrLater: "DP04_0051E",
  moved2023OrLaterPct: "DP04_0051PE",
  moved2020To2022: "DP04_0052E",
  moved2020To2022Pct: "DP04_0052PE",
  moved2010To2019: "DP04_0053E",
  moved2010To2019Pct: "DP04_0053PE",
  moved2000To2009: "DP04_0054E",
  moved2000To2009Pct: "DP04_0054PE",
  moved1990To1999: "DP04_0055E",
  moved1990To1999Pct: "DP04_0055PE",
  moved1989OrEarlier: "DP04_0056E",
  moved1989OrEarlierPct: "DP04_0056PE",
} as const;

export type CensusAcsResidentialTenureCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsResidentialTenureInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsResidentialTenureCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsResidentialTenureIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsResidentialTenure(
  input: CensusAcsResidentialTenureInput,
): Promise<CensusAcsResidentialTenureIngestResult> {
  registerCensusAcsResidentialTenureSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS residential tenure ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsResidentialTenureUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsResidentialTenureIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS residential tenure request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsResidentialTenureResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateResidentialTenureMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsResidentialTenureSource(
  input: CensusAcsResidentialTenureInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate residential tenure characteristics",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP04 aggregate year-householder-moved-into-unit estimates. This source contains aggregate county-level estimates only and must not be used as individual residence or household-history evidence.",
  });
}

export function buildCensusAcsResidentialTenureUrl(input: {
  year: number;
  county: Pick<CensusAcsResidentialTenureCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsResidentialTenureResponse(
  payload: unknown,
  input: Pick<CensusAcsResidentialTenureInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsResidentialTenureCounty,
): AggregateResidentialTenureMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS residential tenure response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS residential tenure response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsResidentialTenureRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsResidentialTenureRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsResidentialTenureInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsResidentialTenureCounty,
): AggregateResidentialTenureMetricInput {
  const getValue = createCensusResidentialTenureRowGetter(header, row);
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
    occupiedHousingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.occupiedHousingUnits),
    ),
    moved2023OrLater: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2023OrLater),
    ),
    moved2023OrLaterPct: parseCensusNumber(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2023OrLaterPct),
    ),
    moved2020To2022: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2020To2022),
    ),
    moved2020To2022Pct: parseCensusNumber(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2020To2022Pct),
    ),
    moved2010To2019: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2010To2019),
    ),
    moved2010To2019Pct: parseCensusNumber(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2010To2019Pct),
    ),
    moved2000To2009: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2000To2009),
    ),
    moved2000To2009Pct: parseCensusNumber(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved2000To2009Pct),
    ),
    moved1990To1999: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1990To1999),
    ),
    moved1990To1999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1990To1999Pct),
    ),
    moved1989OrEarlier: parseCensusInteger(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1989OrEarlier),
    ),
    moved1989OrEarlierPct: parseCensusNumber(
      getValue(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES.moved1989OrEarlierPct),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusResidentialTenureRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_RESIDENTIAL_TENURE_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS residential tenure response missing field: ${field}`,
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
    throw new Error("Census ACS residential tenure response was not valid JSON.");
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

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census ACS residential tenure geography FIPS code is missing.");
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
