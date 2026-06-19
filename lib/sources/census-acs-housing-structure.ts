import {
  upsertAggregateHousingStructureMetric,
  upsertApprovedSource,
  type AggregateHousingStructureMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES = {
  totalHousingUnits: "DP04_0006E",
  oneUnitDetached: "DP04_0007E",
  oneUnitDetachedPct: "DP04_0007PE",
  oneUnitAttached: "DP04_0008E",
  oneUnitAttachedPct: "DP04_0008PE",
  twoUnits: "DP04_0009E",
  twoUnitsPct: "DP04_0009PE",
  threeOrFourUnits: "DP04_0010E",
  threeOrFourUnitsPct: "DP04_0010PE",
  fiveToNineUnits: "DP04_0011E",
  fiveToNineUnitsPct: "DP04_0011PE",
  tenToNineteenUnits: "DP04_0012E",
  tenToNineteenUnitsPct: "DP04_0012PE",
  twentyPlusUnits: "DP04_0013E",
  twentyPlusUnitsPct: "DP04_0013PE",
  mobileHomeUnits: "DP04_0014E",
  mobileHomeUnitsPct: "DP04_0014PE",
  boatRvVanUnits: "DP04_0015E",
  boatRvVanUnitsPct: "DP04_0015PE",
  built2020OrLater: "DP04_0017E",
  built2020OrLaterPct: "DP04_0017PE",
  built2010To2019: "DP04_0018E",
  built2010To2019Pct: "DP04_0018PE",
  built2000To2009: "DP04_0019E",
  built2000To2009Pct: "DP04_0019PE",
  built1990To1999: "DP04_0020E",
  built1990To1999Pct: "DP04_0020PE",
  built1980To1989: "DP04_0021E",
  built1980To1989Pct: "DP04_0021PE",
  built1970To1979: "DP04_0022E",
  built1970To1979Pct: "DP04_0022PE",
  built1960To1969: "DP04_0023E",
  built1960To1969Pct: "DP04_0023PE",
  built1950To1959: "DP04_0024E",
  built1950To1959Pct: "DP04_0024PE",
  built1940To1949: "DP04_0025E",
  built1940To1949Pct: "DP04_0025PE",
  built1939OrEarlier: "DP04_0026E",
  built1939OrEarlierPct: "DP04_0026PE",
} as const;

export type CensusAcsHousingStructureCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHousingStructureInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHousingStructureCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHousingStructureIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHousingStructure(
  input: CensusAcsHousingStructureInput,
): Promise<CensusAcsHousingStructureIngestResult> {
  registerCensusAcsHousingStructureSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS housing structure ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHousingStructureUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsHousingStructureIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS housing structure request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHousingStructureResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHousingStructureMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHousingStructureSource(
  input: CensusAcsHousingStructureInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate housing structure and age",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP04 aggregate units-in-structure and year-built estimates. This source contains aggregate county-level estimates only and must not be used as individual address, occupancy, or residence evidence.",
  });
}

export function buildCensusAcsHousingStructureUrl(input: {
  year: number;
  county: Pick<CensusAcsHousingStructureCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHousingStructureResponse(
  payload: unknown,
  input: Pick<CensusAcsHousingStructureInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingStructureCounty,
): AggregateHousingStructureMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS housing structure response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS housing structure response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsHousingStructureRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHousingStructureRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHousingStructureInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingStructureCounty,
): AggregateHousingStructureMetricInput {
  const getValue = createCensusHousingStructureRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;
  const oneUnitDetached = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.oneUnitDetached),
  );
  const oneUnitAttached = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.oneUnitAttached),
  );
  const twoUnits = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.twoUnits),
  );
  const threeOrFourUnits = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.threeOrFourUnits),
  );
  const fiveToNineUnits = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.fiveToNineUnits),
  );
  const tenToNineteenUnits = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.tenToNineteenUnits),
  );
  const twentyPlusUnits = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.twentyPlusUnits),
  );
  const built2020OrLater = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2020OrLater),
  );
  const built2010To2019 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2010To2019),
  );
  const built1950To1959 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1950To1959),
  );
  const built1940To1949 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1940To1949),
  );
  const built1939OrEarlier = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1939OrEarlier),
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    totalHousingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.totalHousingUnits),
    ),
    oneUnitDetached,
    oneUnitDetachedPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.oneUnitDetachedPct),
    ),
    oneUnitAttached,
    oneUnitAttachedPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.oneUnitAttachedPct),
    ),
    twoUnits,
    twoUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.twoUnitsPct),
    ),
    threeOrFourUnits,
    threeOrFourUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.threeOrFourUnitsPct),
    ),
    fiveToNineUnits,
    fiveToNineUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.fiveToNineUnitsPct),
    ),
    tenToNineteenUnits,
    tenToNineteenUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.tenToNineteenUnitsPct),
    ),
    twentyPlusUnits,
    twentyPlusUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.twentyPlusUnitsPct),
    ),
    mobileHomeUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.mobileHomeUnits),
    ),
    mobileHomeUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.mobileHomeUnitsPct),
    ),
    boatRvVanUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.boatRvVanUnits),
    ),
    boatRvVanUnitsPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.boatRvVanUnitsPct),
    ),
    built2020OrLater,
    built2020OrLaterPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2020OrLaterPct),
    ),
    built2010To2019,
    built2010To2019Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2010To2019Pct),
    ),
    built2000To2009: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2000To2009),
    ),
    built2000To2009Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2000To2009Pct),
    ),
    built1990To1999: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1990To1999),
    ),
    built1990To1999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1990To1999Pct),
    ),
    built1980To1989: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1980To1989),
    ),
    built1980To1989Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1980To1989Pct),
    ),
    built1970To1979: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1970To1979),
    ),
    built1970To1979Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1970To1979Pct),
    ),
    built1960To1969: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1960To1969),
    ),
    built1960To1969Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1960To1969Pct),
    ),
    built1950To1959,
    built1950To1959Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1950To1959Pct),
    ),
    built1940To1949,
    built1940To1949Pct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1940To1949Pct),
    ),
    built1939OrEarlier,
    built1939OrEarlierPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1939OrEarlierPct),
    ),
    singleFamilyUnits: sumNullable(oneUnitDetached, oneUnitAttached),
    singleFamilyUnitsPct: sumNullable(
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.oneUnitDetachedPct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.oneUnitAttachedPct),
      ),
    ),
    smallMultifamilyUnits: sumNullable(
      sumNullable(twoUnits, threeOrFourUnits),
      fiveToNineUnits,
    ),
    smallMultifamilyUnitsPct: sumNullable(
      sumNullable(
        parseCensusNumber(
          getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.twoUnitsPct),
        ),
        parseCensusNumber(
          getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.threeOrFourUnitsPct),
        ),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.fiveToNineUnitsPct),
      ),
    ),
    largeMultifamilyUnits: sumNullable(tenToNineteenUnits, twentyPlusUnits),
    largeMultifamilyUnitsPct: sumNullable(
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.tenToNineteenUnitsPct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.twentyPlusUnitsPct),
      ),
    ),
    built2010OrLater: sumNullable(built2020OrLater, built2010To2019),
    built2010OrLaterPct: sumNullable(
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2020OrLaterPct),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built2010To2019Pct),
      ),
    ),
    builtBefore1960: sumNullable(
      sumNullable(built1950To1959, built1940To1949),
      built1939OrEarlier,
    ),
    builtBefore1960Pct: sumNullable(
      sumNullable(
        parseCensusNumber(
          getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1950To1959Pct),
        ),
        parseCensusNumber(
          getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1940To1949Pct),
        ),
      ),
      parseCensusNumber(
        getValue(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES.built1939OrEarlierPct),
      ),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusHousingStructureRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HOUSING_STRUCTURE_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS housing structure response missing field: ${field}`,
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
    throw new Error("Census ACS housing structure response was not valid JSON.");
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

function sumNullable(left: number | null, right: number | null) {
  if (left === null && right === null) {
    return null;
  }
  return roundOneDecimal((left ?? 0) + (right ?? 0));
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Census ACS housing structure geography FIPS code is missing.");
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
