import {
  upsertAggregatePovertyAssistanceMetric,
  upsertApprovedSource,
  type AggregatePovertyAssistanceMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES = {
  cashPublicAssistanceHouseholds: "DP03_0072E",
  cashPublicAssistanceHouseholdsPct: "DP03_0072PE",
  meanCashPublicAssistanceIncome: "DP03_0073E",
  snapHouseholds: "DP03_0074E",
  snapHouseholdsPct: "DP03_0074PE",
  familiesBelowPoverty: "DP03_0119E",
  familiesBelowPovertyPct: "DP03_0119PE",
  familiesWithChildrenBelowPoverty: "DP03_0120E",
  familiesWithChildrenBelowPovertyPct: "DP03_0120PE",
  femaleHouseholderFamiliesBelowPoverty: "DP03_0125E",
  femaleHouseholderFamiliesBelowPovertyPct: "DP03_0125PE",
  peopleBelowPoverty: "DP03_0128E",
  peopleBelowPovertyPct: "DP03_0128PE",
  childrenBelowPoverty: "DP03_0129E",
  childrenBelowPovertyPct: "DP03_0129PE",
  adults18To64BelowPoverty: "DP03_0134E",
  adults18To64BelowPovertyPct: "DP03_0134PE",
  adults65PlusBelowPoverty: "DP03_0135E",
  adults65PlusBelowPovertyPct: "DP03_0135PE",
} as const;

export type CensusAcsPovertyAssistanceCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsPovertyAssistanceInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsPovertyAssistanceCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsPovertyAssistanceIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsPovertyAssistance(
  input: CensusAcsPovertyAssistanceInput,
): Promise<CensusAcsPovertyAssistanceIngestResult> {
  registerCensusAcsPovertyAssistanceSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS poverty and assistance ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsPovertyAssistanceUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsPovertyAssistanceIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS poverty and assistance request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsPovertyAssistanceResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregatePovertyAssistanceMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsPovertyAssistanceSource(
  input: CensusAcsPovertyAssistanceInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate poverty and public assistance",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP03 aggregate county estimates for poverty, cash public assistance, and SNAP households. This source contains aggregate county-level estimates only and must not be used as evidence of any person's income, benefits, poverty status, residence, or household finances.",
  });
}

export function buildCensusAcsPovertyAssistanceUrl(input: {
  year: number;
  county: Pick<CensusAcsPovertyAssistanceCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsPovertyAssistanceResponse(
  payload: unknown,
  input: Pick<CensusAcsPovertyAssistanceInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsPovertyAssistanceCounty,
): AggregatePovertyAssistanceMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS poverty and assistance response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error(
      "Census ACS poverty and assistance response header is malformed.",
    );
  }

  return rows.map((row) =>
    mapCensusAcsPovertyAssistanceRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsPovertyAssistanceRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsPovertyAssistanceInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsPovertyAssistanceCounty,
): AggregatePovertyAssistanceMetricInput {
  const getValue = createCensusPovertyAssistanceRowGetter(header, row);
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
    cashPublicAssistanceHouseholds: parseCensusInteger(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.cashPublicAssistanceHouseholds,
      ),
    ),
    cashPublicAssistanceHouseholdsPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.cashPublicAssistanceHouseholdsPct,
      ),
    ),
    meanCashPublicAssistanceIncome: parseCensusInteger(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.meanCashPublicAssistanceIncome,
      ),
    ),
    snapHouseholds: parseCensusInteger(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.snapHouseholds),
    ),
    snapHouseholdsPct: parseCensusNumber(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.snapHouseholdsPct),
    ),
    familiesBelowPoverty: parseCensusInteger(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.familiesBelowPoverty),
    ),
    familiesBelowPovertyPct: parseCensusNumber(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.familiesBelowPovertyPct),
    ),
    familiesWithChildrenBelowPoverty: parseCensusInteger(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.familiesWithChildrenBelowPoverty,
      ),
    ),
    familiesWithChildrenBelowPovertyPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.familiesWithChildrenBelowPovertyPct,
      ),
    ),
    femaleHouseholderFamiliesBelowPoverty: parseCensusInteger(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.femaleHouseholderFamiliesBelowPoverty,
      ),
    ),
    femaleHouseholderFamiliesBelowPovertyPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.femaleHouseholderFamiliesBelowPovertyPct,
      ),
    ),
    peopleBelowPoverty: parseCensusInteger(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.peopleBelowPoverty),
    ),
    peopleBelowPovertyPct: parseCensusNumber(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.peopleBelowPovertyPct),
    ),
    childrenBelowPoverty: parseCensusInteger(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.childrenBelowPoverty),
    ),
    childrenBelowPovertyPct: parseCensusNumber(
      getValue(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.childrenBelowPovertyPct),
    ),
    adults18To64BelowPoverty: parseCensusInteger(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.adults18To64BelowPoverty,
      ),
    ),
    adults18To64BelowPovertyPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.adults18To64BelowPovertyPct,
      ),
    ),
    adults65PlusBelowPoverty: parseCensusInteger(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.adults65PlusBelowPoverty,
      ),
    ),
    adults65PlusBelowPovertyPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES.adults65PlusBelowPovertyPct,
      ),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusPovertyAssistanceRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_POVERTY_ASSISTANCE_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS poverty and assistance response missing field: ${field}`,
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
    throw new Error(
      "Census ACS poverty and assistance response was not valid JSON.",
    );
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
      "Census ACS poverty and assistance geography FIPS code is missing.",
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
