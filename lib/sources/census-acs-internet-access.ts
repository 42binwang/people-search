import {
  upsertAggregateInternetAccessMetric,
  upsertApprovedSource,
  type AggregateInternetAccessMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_INTERNET_ACCESS_VARIABLES = {
  totalHouseholds: "DP02_0152E",
  totalHouseholdsPct: "DP02_0152PE",
  withComputer: "DP02_0153E",
  withComputerPct: "DP02_0153PE",
  withBroadband: "DP02_0154E",
  withBroadbandPct: "DP02_0154PE",
} as const;

export type CensusAcsInternetAccessCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsInternetAccessInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsInternetAccessCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsInternetAccessIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsInternetAccess(
  input: CensusAcsInternetAccessInput,
): Promise<CensusAcsInternetAccessIngestResult> {
  registerCensusAcsInternetAccessSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS internet access ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsInternetAccessUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsInternetAccessIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS internet access request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsInternetAccessResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateInternetAccessMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsInternetAccessSource(
  input: CensusAcsInternetAccessInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate internet access",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP02 aggregate county estimates for household computer and broadband access. This source contains aggregate county-level estimates only and must not be used as evidence of any person's devices, subscriptions, residence, income, or household composition.",
  });
}

export function buildCensusAcsInternetAccessUrl(input: {
  year: number;
  county: Pick<CensusAcsInternetAccessCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_INTERNET_ACCESS_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsInternetAccessResponse(
  payload: unknown,
  input: Pick<CensusAcsInternetAccessInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsInternetAccessCounty,
): AggregateInternetAccessMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS internet access response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS internet access response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsInternetAccessRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsInternetAccessRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsInternetAccessInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsInternetAccessCounty,
): AggregateInternetAccessMetricInput {
  const getValue = createCensusInternetAccessRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName: getValue("NAME") || requestedCounty.label,
    totalHouseholds: parseCensusInteger(
      getValue(CENSUS_ACS_INTERNET_ACCESS_VARIABLES.totalHouseholds),
    ),
    totalHouseholdsPct: parseCensusNumber(
      getValue(CENSUS_ACS_INTERNET_ACCESS_VARIABLES.totalHouseholdsPct),
    ),
    withComputer: parseCensusInteger(
      getValue(CENSUS_ACS_INTERNET_ACCESS_VARIABLES.withComputer),
    ),
    withComputerPct: parseCensusNumber(
      getValue(CENSUS_ACS_INTERNET_ACCESS_VARIABLES.withComputerPct),
    ),
    withBroadband: parseCensusInteger(
      getValue(CENSUS_ACS_INTERNET_ACCESS_VARIABLES.withBroadband),
    ),
    withBroadbandPct: parseCensusNumber(
      getValue(CENSUS_ACS_INTERNET_ACCESS_VARIABLES.withBroadbandPct),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusInternetAccessRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_INTERNET_ACCESS_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS internet access response missing field: ${field}`,
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
    throw new Error("Census ACS internet access response was not valid JSON.");
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
    throw new Error("Census ACS internet access geography FIPS code is missing.");
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
