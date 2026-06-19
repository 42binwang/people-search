import {
  upsertAggregateLanguageProficiencyMetric,
  upsertApprovedSource,
  type AggregateLanguageProficiencyMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES = {
  population5Plus: "DP02_0112E",
  englishOnly: "DP02_0113E",
  englishOnlyPct: "DP02_0113PE",
  languageOtherThanEnglish: "DP02_0114E",
  languageOtherThanEnglishPct: "DP02_0114PE",
  limitedEnglish: "DP02_0115E",
  limitedEnglishPct: "DP02_0115PE",
  spanish: "DP02_0116E",
  spanishPct: "DP02_0116PE",
  spanishLimitedEnglish: "DP02_0117E",
  spanishLimitedEnglishPct: "DP02_0117PE",
  otherIndoEuropean: "DP02_0118E",
  otherIndoEuropeanPct: "DP02_0118PE",
  otherIndoEuropeanLimitedEnglish: "DP02_0119E",
  otherIndoEuropeanLimitedEnglishPct: "DP02_0119PE",
  asianPacificIslander: "DP02_0120E",
  asianPacificIslanderPct: "DP02_0120PE",
  asianPacificIslanderLimitedEnglish: "DP02_0121E",
  asianPacificIslanderLimitedEnglishPct: "DP02_0121PE",
  otherLanguages: "DP02_0122E",
  otherLanguagesPct: "DP02_0122PE",
  otherLanguagesLimitedEnglish: "DP02_0123E",
  otherLanguagesLimitedEnglishPct: "DP02_0123PE",
} as const;

export type CensusAcsLanguageProficiencyCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsLanguageProficiencyInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsLanguageProficiencyCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsLanguageProficiencyIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsLanguageProficiency(
  input: CensusAcsLanguageProficiencyInput,
): Promise<CensusAcsLanguageProficiencyIngestResult> {
  registerCensusAcsLanguageProficiencySource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS language proficiency ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsLanguageProficiencyUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsLanguageProficiencyIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS language proficiency request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsLanguageProficiencyResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateLanguageProficiencyMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsLanguageProficiencySource(
  input: CensusAcsLanguageProficiencyInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate language proficiency",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP02 aggregate county estimates for language spoken at home and English proficiency. This source contains aggregate county-level estimates only and must not be used as evidence of any person's language, national origin, immigration status, residence, or household composition.",
  });
}

export function buildCensusAcsLanguageProficiencyUrl(input: {
  year: number;
  county: Pick<CensusAcsLanguageProficiencyCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsLanguageProficiencyResponse(
  payload: unknown,
  input: Pick<CensusAcsLanguageProficiencyInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsLanguageProficiencyCounty,
): AggregateLanguageProficiencyMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS language proficiency response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error(
      "Census ACS language proficiency response header is malformed.",
    );
  }

  return rows.map((row) =>
    mapCensusAcsLanguageProficiencyRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsLanguageProficiencyRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsLanguageProficiencyInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsLanguageProficiencyCounty,
): AggregateLanguageProficiencyMetricInput {
  const getValue = createCensusLanguageProficiencyRowGetter(header, row);
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
    population5Plus: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.population5Plus),
    ),
    englishOnly: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.englishOnly),
    ),
    englishOnlyPct: parseCensusNumber(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.englishOnlyPct),
    ),
    languageOtherThanEnglish: parseCensusInteger(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.languageOtherThanEnglish,
      ),
    ),
    languageOtherThanEnglishPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.languageOtherThanEnglishPct,
      ),
    ),
    limitedEnglish: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.limitedEnglish),
    ),
    limitedEnglishPct: parseCensusNumber(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.limitedEnglishPct),
    ),
    spanish: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.spanish),
    ),
    spanishPct: parseCensusNumber(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.spanishPct),
    ),
    spanishLimitedEnglish: parseCensusInteger(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.spanishLimitedEnglish,
      ),
    ),
    spanishLimitedEnglishPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.spanishLimitedEnglishPct,
      ),
    ),
    otherIndoEuropean: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.otherIndoEuropean),
    ),
    otherIndoEuropeanPct: parseCensusNumber(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.otherIndoEuropeanPct),
    ),
    otherIndoEuropeanLimitedEnglish: parseCensusInteger(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES
          .otherIndoEuropeanLimitedEnglish,
      ),
    ),
    otherIndoEuropeanLimitedEnglishPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES
          .otherIndoEuropeanLimitedEnglishPct,
      ),
    ),
    asianPacificIslander: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.asianPacificIslander),
    ),
    asianPacificIslanderPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.asianPacificIslanderPct,
      ),
    ),
    asianPacificIslanderLimitedEnglish: parseCensusInteger(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES
          .asianPacificIslanderLimitedEnglish,
      ),
    ),
    asianPacificIslanderLimitedEnglishPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES
          .asianPacificIslanderLimitedEnglishPct,
      ),
    ),
    otherLanguages: parseCensusInteger(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.otherLanguages),
    ),
    otherLanguagesPct: parseCensusNumber(
      getValue(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.otherLanguagesPct),
    ),
    otherLanguagesLimitedEnglish: parseCensusInteger(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES.otherLanguagesLimitedEnglish,
      ),
    ),
    otherLanguagesLimitedEnglishPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES
          .otherLanguagesLimitedEnglishPct,
      ),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusLanguageProficiencyRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_LANGUAGE_PROFICIENCY_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS language proficiency response missing field: ${field}`,
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
    throw new Error("Census ACS language proficiency response was not valid JSON.");
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
      "Census ACS language proficiency geography FIPS code is missing.",
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
