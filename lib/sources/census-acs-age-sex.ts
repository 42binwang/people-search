import {
  upsertAggregateAgeSexMetric,
  upsertApprovedSource,
  type AggregateAgeSexMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_AGE_SEX_VARIABLES = {
  totalPopulation: "DP05_0001E",
  male: "DP05_0002E",
  malePct: "DP05_0002PE",
  female: "DP05_0003E",
  femalePct: "DP05_0003PE",
  sexRatio: "DP05_0004E",
  under5: "DP05_0005E",
  under5Pct: "DP05_0005PE",
  age5To9: "DP05_0006E",
  age5To9Pct: "DP05_0006PE",
  age10To14: "DP05_0007E",
  age10To14Pct: "DP05_0007PE",
  age15To19: "DP05_0008E",
  age15To19Pct: "DP05_0008PE",
  age20To24: "DP05_0009E",
  age20To24Pct: "DP05_0009PE",
  age25To34: "DP05_0010E",
  age25To34Pct: "DP05_0010PE",
  age35To44: "DP05_0011E",
  age35To44Pct: "DP05_0011PE",
  age45To54: "DP05_0012E",
  age45To54Pct: "DP05_0012PE",
  age55To59: "DP05_0013E",
  age55To59Pct: "DP05_0013PE",
  age60To64: "DP05_0014E",
  age60To64Pct: "DP05_0014PE",
  age65To74: "DP05_0015E",
  age65To74Pct: "DP05_0015PE",
  age75To84: "DP05_0016E",
  age75To84Pct: "DP05_0016PE",
  age85Plus: "DP05_0017E",
  age85PlusPct: "DP05_0017PE",
  medianAge: "DP05_0018E",
} as const;

export type CensusAcsAgeSexCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsAgeSexInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsAgeSexCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsAgeSexIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsAgeSex(
  input: CensusAcsAgeSexInput,
): Promise<CensusAcsAgeSexIngestResult> {
  registerCensusAcsAgeSexSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS age and sex ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsAgeSexUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchCensusAcsAgeSexIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS age and sex request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsAgeSexResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateAgeSexMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsAgeSexSource(input: CensusAcsAgeSexInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate age and sex",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP05 aggregate county estimates for age and sex distribution. This source contains aggregate county-level estimates only and must not be used as evidence of any person's age, sex, residence, household composition, or eligibility.",
  });
}

export function buildCensusAcsAgeSexUrl(input: {
  year: number;
  county: Pick<CensusAcsAgeSexCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_AGE_SEX_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsAgeSexResponse(
  payload: unknown,
  input: Pick<CensusAcsAgeSexInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsAgeSexCounty,
): AggregateAgeSexMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error("Census ACS age and sex response did not include data rows.");
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS age and sex response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsAgeSexRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsAgeSexRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsAgeSexInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsAgeSexCounty,
): AggregateAgeSexMetricInput {
  const getValue = createCensusAgeSexRowGetter(header, row);
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
    totalPopulation: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.totalPopulation),
    ),
    male: parseCensusInteger(getValue(CENSUS_ACS_AGE_SEX_VARIABLES.male)),
    malePct: parseCensusNumber(getValue(CENSUS_ACS_AGE_SEX_VARIABLES.malePct)),
    female: parseCensusInteger(getValue(CENSUS_ACS_AGE_SEX_VARIABLES.female)),
    femalePct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.femalePct),
    ),
    sexRatio: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.sexRatio),
    ),
    under5: parseCensusInteger(getValue(CENSUS_ACS_AGE_SEX_VARIABLES.under5)),
    under5Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.under5Pct),
    ),
    age5To9: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age5To9),
    ),
    age5To9Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age5To9Pct),
    ),
    age10To14: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age10To14),
    ),
    age10To14Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age10To14Pct),
    ),
    age15To19: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age15To19),
    ),
    age15To19Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age15To19Pct),
    ),
    age20To24: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age20To24),
    ),
    age20To24Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age20To24Pct),
    ),
    age25To34: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age25To34),
    ),
    age25To34Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age25To34Pct),
    ),
    age35To44: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age35To44),
    ),
    age35To44Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age35To44Pct),
    ),
    age45To54: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age45To54),
    ),
    age45To54Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age45To54Pct),
    ),
    age55To59: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age55To59),
    ),
    age55To59Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age55To59Pct),
    ),
    age60To64: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age60To64),
    ),
    age60To64Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age60To64Pct),
    ),
    age65To74: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age65To74),
    ),
    age65To74Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age65To74Pct),
    ),
    age75To84: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age75To84),
    ),
    age75To84Pct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age75To84Pct),
    ),
    age85Plus: parseCensusInteger(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age85Plus),
    ),
    age85PlusPct: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.age85PlusPct),
    ),
    medianAge: parseCensusNumber(
      getValue(CENSUS_ACS_AGE_SEX_VARIABLES.medianAge),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusAgeSexRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_AGE_SEX_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(`Census ACS age and sex response missing field: ${field}`);
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
    throw new Error("Census ACS age and sex response was not valid JSON.");
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
    throw new Error("Census ACS age and sex geography FIPS code is missing.");
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
