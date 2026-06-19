import {
  upsertAggregateRaceOriginMetric,
  upsertApprovedSource,
  type AggregateRaceOriginMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_RACE_ORIGIN_VARIABLES = {
  raceTotalPopulation: "DP05_0033E",
  white: "DP05_0037E",
  whitePct: "DP05_0037PE",
  black: "DP05_0045E",
  blackPct: "DP05_0045PE",
  americanIndianAlaskaNative: "DP05_0053E",
  americanIndianAlaskaNativePct: "DP05_0053PE",
  asian: "DP05_0061E",
  asianPct: "DP05_0061PE",
  nativeHawaiianPacificIslander: "DP05_0069E",
  nativeHawaiianPacificIslanderPct: "DP05_0069PE",
  someOtherRace: "DP05_0074E",
  someOtherRacePct: "DP05_0074PE",
  twoOrMoreRaces: "DP05_0035E",
  twoOrMoreRacesPct: "DP05_0035PE",
  hispanicLatino: "DP05_0090E",
  hispanicLatinoPct: "DP05_0090PE",
  notHispanicLatino: "DP05_0095E",
  notHispanicLatinoPct: "DP05_0095PE",
  whiteNonHispanic: "DP05_0096E",
  whiteNonHispanicPct: "DP05_0096PE",
} as const;

export type CensusAcsRaceOriginCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsRaceOriginInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsRaceOriginCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsRaceOriginIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsRaceOrigin(
  input: CensusAcsRaceOriginInput,
): Promise<CensusAcsRaceOriginIngestResult> {
  registerCensusAcsRaceOriginSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS race and origin ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsRaceOriginUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsRaceOriginIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS race and origin request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsRaceOriginResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateRaceOriginMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsRaceOriginSource(
  input: CensusAcsRaceOriginInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate race and origin",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP05 aggregate county estimates for race and Hispanic or Latino origin. This source contains aggregate county-level estimates only and must not be used as evidence of any person's race, ethnicity, origin, residence, household composition, or eligibility.",
  });
}

export function buildCensusAcsRaceOriginUrl(input: {
  year: number;
  county: Pick<CensusAcsRaceOriginCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_RACE_ORIGIN_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsRaceOriginResponse(
  payload: unknown,
  input: Pick<CensusAcsRaceOriginInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsRaceOriginCounty,
): AggregateRaceOriginMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS race and origin response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS race and origin response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsRaceOriginRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsRaceOriginRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsRaceOriginInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsRaceOriginCounty,
): AggregateRaceOriginMetricInput {
  const getValue = createCensusRaceOriginRowGetter(header, row);
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
    raceTotalPopulation: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.raceTotalPopulation),
    ),
    white: parseCensusInteger(getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.white)),
    whitePct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.whitePct),
    ),
    black: parseCensusInteger(getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.black)),
    blackPct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.blackPct),
    ),
    americanIndianAlaskaNative: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.americanIndianAlaskaNative),
    ),
    americanIndianAlaskaNativePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_RACE_ORIGIN_VARIABLES.americanIndianAlaskaNativePct,
      ),
    ),
    asian: parseCensusInteger(getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.asian)),
    asianPct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.asianPct),
    ),
    nativeHawaiianPacificIslander: parseCensusInteger(
      getValue(
        CENSUS_ACS_RACE_ORIGIN_VARIABLES.nativeHawaiianPacificIslander,
      ),
    ),
    nativeHawaiianPacificIslanderPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_RACE_ORIGIN_VARIABLES.nativeHawaiianPacificIslanderPct,
      ),
    ),
    someOtherRace: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.someOtherRace),
    ),
    someOtherRacePct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.someOtherRacePct),
    ),
    twoOrMoreRaces: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.twoOrMoreRaces),
    ),
    twoOrMoreRacesPct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.twoOrMoreRacesPct),
    ),
    hispanicLatino: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.hispanicLatino),
    ),
    hispanicLatinoPct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.hispanicLatinoPct),
    ),
    notHispanicLatino: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.notHispanicLatino),
    ),
    notHispanicLatinoPct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.notHispanicLatinoPct),
    ),
    whiteNonHispanic: parseCensusInteger(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.whiteNonHispanic),
    ),
    whiteNonHispanicPct: parseCensusNumber(
      getValue(CENSUS_ACS_RACE_ORIGIN_VARIABLES.whiteNonHispanicPct),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusRaceOriginRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_RACE_ORIGIN_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS race and origin response missing field: ${field}`,
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
    throw new Error("Census ACS race and origin response was not valid JSON.");
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
      "Census ACS race and origin geography FIPS code is missing.",
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
