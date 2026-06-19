import {
  upsertAggregateHouseholdIncomeMetric,
  upsertApprovedSource,
  type AggregateHouseholdIncomeMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES = {
  totalHouseholds: "DP03_0051E",
  incomeUnder10k: "DP03_0052E",
  incomeUnder10kPct: "DP03_0052PE",
  income10kTo14999: "DP03_0053E",
  income10kTo14999Pct: "DP03_0053PE",
  income15kTo24999: "DP03_0054E",
  income15kTo24999Pct: "DP03_0054PE",
  income25kTo34999: "DP03_0055E",
  income25kTo34999Pct: "DP03_0055PE",
  income35kTo49999: "DP03_0056E",
  income35kTo49999Pct: "DP03_0056PE",
  income50kTo74999: "DP03_0057E",
  income50kTo74999Pct: "DP03_0057PE",
  income75kTo99999: "DP03_0058E",
  income75kTo99999Pct: "DP03_0058PE",
  income100kTo149999: "DP03_0059E",
  income100kTo149999Pct: "DP03_0059PE",
  income150kTo199999: "DP03_0060E",
  income150kTo199999Pct: "DP03_0060PE",
  income200kPlus: "DP03_0061E",
  income200kPlusPct: "DP03_0061PE",
  medianHouseholdIncome: "DP03_0062E",
  meanHouseholdIncome: "DP03_0063E",
} as const;

export type CensusAcsHouseholdIncomeCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHouseholdIncomeInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHouseholdIncomeCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHouseholdIncomeIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHouseholdIncome(
  input: CensusAcsHouseholdIncomeInput,
): Promise<CensusAcsHouseholdIncomeIngestResult> {
  registerCensusAcsHouseholdIncomeSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS household income ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHouseholdIncomeUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsHouseholdIncomeIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS household income request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHouseholdIncomeResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHouseholdIncomeMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHouseholdIncomeSource(
  input: CensusAcsHouseholdIncomeInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate household income distribution",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP03 aggregate household income distribution estimates. This source contains aggregate county-level estimates only and must not be used as evidence of any person's income, employment, wealth, residence, or household finances.",
  });
}

export function buildCensusAcsHouseholdIncomeUrl(input: {
  year: number;
  county: Pick<CensusAcsHouseholdIncomeCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHouseholdIncomeResponse(
  payload: unknown,
  input: Pick<CensusAcsHouseholdIncomeInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHouseholdIncomeCounty,
): AggregateHouseholdIncomeMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS household income response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS household income response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsHouseholdIncomeRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHouseholdIncomeRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHouseholdIncomeInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHouseholdIncomeCounty,
): AggregateHouseholdIncomeMetricInput {
  const getValue = createCensusHouseholdIncomeRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;
  const incomeUnder10k = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.incomeUnder10k),
  );
  const income10kTo14999 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income10kTo14999),
  );
  const income15kTo24999 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income15kTo24999),
  );
  const income25kTo34999 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income25kTo34999),
  );
  const income35kTo49999 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income35kTo49999),
  );
  const income100kTo149999 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income100kTo149999),
  );
  const income150kTo199999 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income150kTo199999),
  );
  const income200kPlus = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income200kPlus),
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    totalHouseholds: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.totalHouseholds),
    ),
    incomeUnder10k,
    incomeUnder10kPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.incomeUnder10kPct),
    ),
    income10kTo14999,
    income10kTo14999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income10kTo14999Pct),
    ),
    income15kTo24999,
    income15kTo24999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income15kTo24999Pct),
    ),
    income25kTo34999,
    income25kTo34999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income25kTo34999Pct),
    ),
    income35kTo49999,
    income35kTo49999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income35kTo49999Pct),
    ),
    income50kTo74999: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income50kTo74999),
    ),
    income50kTo74999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income50kTo74999Pct),
    ),
    income75kTo99999: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income75kTo99999),
    ),
    income75kTo99999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income75kTo99999Pct),
    ),
    income100kTo149999,
    income100kTo149999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income100kTo149999Pct),
    ),
    income150kTo199999,
    income150kTo199999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income150kTo199999Pct),
    ),
    income200kPlus,
    income200kPlusPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income200kPlusPct),
    ),
    medianHouseholdIncome: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.medianHouseholdIncome),
    ),
    meanHouseholdIncome: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.meanHouseholdIncome),
    ),
    incomeUnder50k: sumNullableMany([
      incomeUnder10k,
      income10kTo14999,
      income15kTo24999,
      income25kTo34999,
      income35kTo49999,
    ]),
    incomeUnder50kPct: sumNullableMany([
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.incomeUnder10kPct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income10kTo14999Pct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income15kTo24999Pct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income25kTo34999Pct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income35kTo49999Pct),
      ),
    ]),
    income100kPlus: sumNullableMany([
      income100kTo149999,
      income150kTo199999,
      income200kPlus,
    ]),
    income100kPlusPct: sumNullableMany([
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income100kTo149999Pct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income150kTo199999Pct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income200kPlusPct),
      ),
    ]),
    income150kPlus: sumNullableMany([income150kTo199999, income200kPlus]),
    income150kPlusPct: sumNullableMany([
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income150kTo199999Pct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES.income200kPlusPct),
      ),
    ]),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusHouseholdIncomeRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HOUSEHOLD_INCOME_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS household income response missing field: ${field}`,
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
    throw new Error("Census ACS household income response was not valid JSON.");
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

function sumNullableMany(values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return roundOneDecimal(present.reduce((total, value) => total + value, 0));
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error(
      "Census ACS household income geography FIPS code is missing.",
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
