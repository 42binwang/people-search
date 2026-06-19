import {
  upsertAggregateHouseholdCompositionMetric,
  upsertApprovedSource,
  type AggregateHouseholdCompositionMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES = {
  totalHouseholds: "DP02_0001E",
  marriedCoupleHouseholds: "DP02_0002E",
  marriedCoupleHouseholdsPct: "DP02_0002PE",
  marriedCoupleWithChildren: "DP02_0003E",
  marriedCoupleWithChildrenPct: "DP02_0003PE",
  cohabitingCoupleHouseholds: "DP02_0004E",
  cohabitingCoupleHouseholdsPct: "DP02_0004PE",
  cohabitingCoupleWithChildren: "DP02_0005E",
  cohabitingCoupleWithChildrenPct: "DP02_0005PE",
  maleNoSpouseHouseholds: "DP02_0006E",
  maleNoSpouseHouseholdsPct: "DP02_0006PE",
  maleLivingAlone: "DP02_0008E",
  maleLivingAlonePct: "DP02_0008PE",
  maleLivingAlone65Plus: "DP02_0009E",
  maleLivingAlone65PlusPct: "DP02_0009PE",
  femaleNoSpouseHouseholds: "DP02_0010E",
  femaleNoSpouseHouseholdsPct: "DP02_0010PE",
  femaleLivingAlone: "DP02_0012E",
  femaleLivingAlonePct: "DP02_0012PE",
  femaleLivingAlone65Plus: "DP02_0013E",
  femaleLivingAlone65PlusPct: "DP02_0013PE",
  householdsWithUnder18: "DP02_0014E",
  householdsWithUnder18Pct: "DP02_0014PE",
  householdsWith65Plus: "DP02_0015E",
  householdsWith65PlusPct: "DP02_0015PE",
  averageHouseholdSize: "DP02_0016E",
  averageFamilySize: "DP02_0017E",
} as const;

export type CensusAcsHouseholdCompositionCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHouseholdCompositionInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHouseholdCompositionCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHouseholdCompositionIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHouseholdComposition(
  input: CensusAcsHouseholdCompositionInput,
): Promise<CensusAcsHouseholdCompositionIngestResult> {
  registerCensusAcsHouseholdCompositionSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS household composition ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHouseholdCompositionUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsHouseholdCompositionIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS household composition request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHouseholdCompositionResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHouseholdCompositionMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHouseholdCompositionSource(
  input: CensusAcsHouseholdCompositionInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate household composition",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP02 aggregate household-composition estimates. This source contains aggregate county-level estimates only and must not be used as individual household, family, or residence evidence.",
  });
}

export function buildCensusAcsHouseholdCompositionUrl(input: {
  year: number;
  county: Pick<CensusAcsHouseholdCompositionCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHouseholdCompositionResponse(
  payload: unknown,
  input: Pick<CensusAcsHouseholdCompositionInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHouseholdCompositionCounty,
): AggregateHouseholdCompositionMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS household composition response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error(
      "Census ACS household composition response header is malformed.",
    );
  }

  return rows.map((row) =>
    mapCensusAcsHouseholdCompositionRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHouseholdCompositionRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHouseholdCompositionInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHouseholdCompositionCounty,
): AggregateHouseholdCompositionMetricInput {
  const getValue = createCensusHouseholdCompositionRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;
  const maleLivingAlone = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlone),
  );
  const femaleLivingAlone = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlone),
  );
  const maleLivingAlonePct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlonePct),
  );
  const femaleLivingAlonePct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlonePct),
  );
  const maleLivingAlone65Plus = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlone65Plus),
  );
  const femaleLivingAlone65Plus = parseCensusInteger(
    getValue(
      CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlone65Plus,
    ),
  );
  const maleLivingAlone65PlusPct = parseCensusNumber(
    getValue(
      CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleLivingAlone65PlusPct,
    ),
  );
  const femaleLivingAlone65PlusPct = parseCensusNumber(
    getValue(
      CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleLivingAlone65PlusPct,
    ),
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
      getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.totalHouseholds),
    ),
    marriedCoupleHouseholds: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleHouseholds,
      ),
    ),
    marriedCoupleHouseholdsPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleHouseholdsPct,
      ),
    ),
    marriedCoupleWithChildren: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.marriedCoupleWithChildren,
      ),
    ),
    marriedCoupleWithChildrenPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES
          .marriedCoupleWithChildrenPct,
      ),
    ),
    cohabitingCoupleHouseholds: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.cohabitingCoupleHouseholds,
      ),
    ),
    cohabitingCoupleHouseholdsPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES
          .cohabitingCoupleHouseholdsPct,
      ),
    ),
    cohabitingCoupleWithChildren: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES
          .cohabitingCoupleWithChildren,
      ),
    ),
    cohabitingCoupleWithChildrenPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES
          .cohabitingCoupleWithChildrenPct,
      ),
    ),
    maleNoSpouseHouseholds: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleNoSpouseHouseholds,
      ),
    ),
    maleNoSpouseHouseholdsPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.maleNoSpouseHouseholdsPct,
      ),
    ),
    maleLivingAlone,
    maleLivingAlonePct,
    maleLivingAlone65Plus,
    maleLivingAlone65PlusPct,
    femaleNoSpouseHouseholds: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.femaleNoSpouseHouseholds,
      ),
    ),
    femaleNoSpouseHouseholdsPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES
          .femaleNoSpouseHouseholdsPct,
      ),
    ),
    femaleLivingAlone,
    femaleLivingAlonePct,
    femaleLivingAlone65Plus,
    femaleLivingAlone65PlusPct,
    householdsWithUnder18: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWithUnder18),
    ),
    householdsWithUnder18Pct: parseCensusNumber(
      getValue(
        CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWithUnder18Pct,
      ),
    ),
    householdsWith65Plus: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWith65Plus),
    ),
    householdsWith65PlusPct: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.householdsWith65PlusPct),
    ),
    averageHouseholdSize: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.averageHouseholdSize),
    ),
    averageFamilySize: parseCensusNumber(
      getValue(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES.averageFamilySize),
    ),
    singlePersonHouseholds: sumNullable(maleLivingAlone, femaleLivingAlone),
    singlePersonHouseholdsPct: sumNullable(
      maleLivingAlonePct,
      femaleLivingAlonePct,
    ),
    livingAlone65Plus: sumNullable(
      maleLivingAlone65Plus,
      femaleLivingAlone65Plus,
    ),
    livingAlone65PlusPct: sumNullable(
      maleLivingAlone65PlusPct,
      femaleLivingAlone65PlusPct,
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusHouseholdCompositionRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HOUSEHOLD_COMPOSITION_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS household composition response missing field: ${field}`,
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
      "Census ACS household composition response was not valid JSON.",
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
    throw new Error(
      "Census ACS household composition geography FIPS code is missing.",
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
