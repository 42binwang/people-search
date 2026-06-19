import {
  upsertAggregateEmploymentStatusMetric,
  upsertApprovedSource,
  type AggregateEmploymentStatusMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES = {
  population16Plus: "DP03_0001E",
  inLaborForce: "DP03_0002E",
  inLaborForcePct: "DP03_0002PE",
  civilianLaborForce: "DP03_0003E",
  civilianLaborForcePct: "DP03_0003PE",
  employed: "DP03_0004E",
  employedPct: "DP03_0004PE",
  unemployed: "DP03_0005E",
  unemployedPct: "DP03_0005PE",
  armedForces: "DP03_0006E",
  armedForcesPct: "DP03_0006PE",
  notInLaborForce: "DP03_0007E",
  notInLaborForcePct: "DP03_0007PE",
  unemploymentRate: "DP03_0009PE",
} as const;

export type CensusAcsEmploymentStatusCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsEmploymentStatusInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsEmploymentStatusCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsEmploymentStatusIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsEmploymentStatus(
  input: CensusAcsEmploymentStatusInput,
): Promise<CensusAcsEmploymentStatusIngestResult> {
  registerCensusAcsEmploymentStatusSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS employment status ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsEmploymentStatusUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsEmploymentStatusIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS employment status request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsEmploymentStatusResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateEmploymentStatusMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsEmploymentStatusSource(
  input: CensusAcsEmploymentStatusInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate employment status",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP03 aggregate county estimates for employment status. This source contains aggregate county-level estimates only and must not be used as evidence of any person's employment, income, residence, or household finances.",
  });
}

export function buildCensusAcsEmploymentStatusUrl(input: {
  year: number;
  county: Pick<CensusAcsEmploymentStatusCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsEmploymentStatusResponse(
  payload: unknown,
  input: Pick<CensusAcsEmploymentStatusInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsEmploymentStatusCounty,
): AggregateEmploymentStatusMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS employment status response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS employment status response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsEmploymentStatusRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsEmploymentStatusRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsEmploymentStatusInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsEmploymentStatusCounty,
): AggregateEmploymentStatusMetricInput {
  const getValue = createCensusEmploymentStatusRowGetter(header, row);
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
    population16Plus: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.population16Plus),
    ),
    inLaborForce: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.inLaborForce),
    ),
    inLaborForcePct: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.inLaborForcePct),
    ),
    civilianLaborForce: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.civilianLaborForce),
    ),
    civilianLaborForcePct: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.civilianLaborForcePct),
    ),
    employed: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.employed),
    ),
    employedPct: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.employedPct),
    ),
    unemployed: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.unemployed),
    ),
    unemployedPct: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.unemployedPct),
    ),
    armedForces: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.armedForces),
    ),
    armedForcesPct: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.armedForcesPct),
    ),
    notInLaborForce: parseCensusInteger(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.notInLaborForce),
    ),
    notInLaborForcePct: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.notInLaborForcePct),
    ),
    unemploymentRate: parseCensusNumber(
      getValue(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES.unemploymentRate),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusEmploymentStatusRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_EMPLOYMENT_STATUS_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS employment status response missing field: ${field}`,
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
    throw new Error("Census ACS employment status response was not valid JSON.");
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
    throw new Error(
      "Census ACS employment status geography FIPS code is missing.",
    );
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
