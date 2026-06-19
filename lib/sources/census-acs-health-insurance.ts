import {
  upsertAggregateHealthInsuranceMetric,
  upsertApprovedSource,
  type AggregateHealthInsuranceMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HEALTH_INSURANCE_VARIABLES = {
  civilianNoninstitutionalizedPopulation: "DP03_0095E",
  withHealthInsurance: "DP03_0096E",
  withHealthInsurancePct: "DP03_0096PE",
  privateHealthInsurance: "DP03_0097E",
  privateHealthInsurancePct: "DP03_0097PE",
  publicCoverage: "DP03_0098E",
  publicCoveragePct: "DP03_0098PE",
  noHealthInsurance: "DP03_0099E",
  noHealthInsurancePct: "DP03_0099PE",
  under19Population: "DP03_0100E",
  under19NoHealthInsurance: "DP03_0101E",
  under19NoHealthInsurancePct: "DP03_0101PE",
  age19To64Population: "DP03_0102E",
  employedAge19To64NoHealthInsurance: "DP03_0108E",
  employedAge19To64NoHealthInsurancePct: "DP03_0108PE",
  unemployedAge19To64NoHealthInsurance: "DP03_0113E",
  unemployedAge19To64NoHealthInsurancePct: "DP03_0113PE",
  notInLaborForceAge19To64NoHealthInsurance: "DP03_0118E",
  notInLaborForceAge19To64NoHealthInsurancePct: "DP03_0118PE",
} as const;

export type CensusAcsHealthInsuranceCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHealthInsuranceInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHealthInsuranceCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHealthInsuranceIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHealthInsurance(
  input: CensusAcsHealthInsuranceInput,
): Promise<CensusAcsHealthInsuranceIngestResult> {
  registerCensusAcsHealthInsuranceSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS health insurance ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHealthInsuranceUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsHealthInsuranceIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS health insurance request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHealthInsuranceResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHealthInsuranceMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHealthInsuranceSource(
  input: CensusAcsHealthInsuranceInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate health insurance coverage",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP03 aggregate county estimates for health insurance coverage. This source contains aggregate county-level estimates only and must not be used as evidence of any person's insurance status, medical status, income, benefits, residence, or household finances.",
  });
}

export function buildCensusAcsHealthInsuranceUrl(input: {
  year: number;
  county: Pick<CensusAcsHealthInsuranceCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHealthInsuranceResponse(
  payload: unknown,
  input: Pick<CensusAcsHealthInsuranceInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHealthInsuranceCounty,
): AggregateHealthInsuranceMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS health insurance response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS health insurance response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsHealthInsuranceRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHealthInsuranceRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHealthInsuranceInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHealthInsuranceCounty,
): AggregateHealthInsuranceMetricInput {
  const getValue = createCensusHealthInsuranceRowGetter(header, row);
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
    civilianNoninstitutionalizedPopulation: parseCensusInteger(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.civilianNoninstitutionalizedPopulation,
      ),
    ),
    withHealthInsurance: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.withHealthInsurance),
    ),
    withHealthInsurancePct: parseCensusNumber(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.withHealthInsurancePct),
    ),
    privateHealthInsurance: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.privateHealthInsurance),
    ),
    privateHealthInsurancePct: parseCensusNumber(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.privateHealthInsurancePct),
    ),
    publicCoverage: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.publicCoverage),
    ),
    publicCoveragePct: parseCensusNumber(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.publicCoveragePct),
    ),
    noHealthInsurance: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.noHealthInsurance),
    ),
    noHealthInsurancePct: parseCensusNumber(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.noHealthInsurancePct),
    ),
    under19Population: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.under19Population),
    ),
    under19NoHealthInsurance: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.under19NoHealthInsurance),
    ),
    under19NoHealthInsurancePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.under19NoHealthInsurancePct,
      ),
    ),
    age19To64Population: parseCensusInteger(
      getValue(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.age19To64Population),
    ),
    employedAge19To64NoHealthInsurance: parseCensusInteger(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.employedAge19To64NoHealthInsurance,
      ),
    ),
    employedAge19To64NoHealthInsurancePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.employedAge19To64NoHealthInsurancePct,
      ),
    ),
    unemployedAge19To64NoHealthInsurance: parseCensusInteger(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.unemployedAge19To64NoHealthInsurance,
      ),
    ),
    unemployedAge19To64NoHealthInsurancePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.unemployedAge19To64NoHealthInsurancePct,
      ),
    ),
    notInLaborForceAge19To64NoHealthInsurance: parseCensusInteger(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.notInLaborForceAge19To64NoHealthInsurance,
      ),
    ),
    notInLaborForceAge19To64NoHealthInsurancePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HEALTH_INSURANCE_VARIABLES.notInLaborForceAge19To64NoHealthInsurancePct,
      ),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusHealthInsuranceRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HEALTH_INSURANCE_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS health insurance response missing field: ${field}`,
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
    throw new Error("Census ACS health insurance response was not valid JSON.");
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
      "Census ACS health insurance geography FIPS code is missing.",
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
