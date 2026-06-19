import {
  upsertAggregateHousingCostBurdenMetric,
  upsertApprovedSource,
  type AggregateHousingCostBurdenMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES = {
  medianOwnerCostWithMortgage: "DP04_0101E",
  medianOwnerCostWithoutMortgage: "DP04_0109E",
  ownerMortgageUnits: "DP04_0110E",
  ownerMortgage30To34: "DP04_0114E",
  ownerMortgage30To34Pct: "DP04_0114PE",
  ownerMortgage35Plus: "DP04_0115E",
  ownerMortgage35PlusPct: "DP04_0115PE",
  ownerNoMortgageUnits: "DP04_0117E",
  ownerNoMortgage30To34: "DP04_0123E",
  ownerNoMortgage30To34Pct: "DP04_0123PE",
  ownerNoMortgage35Plus: "DP04_0124E",
  ownerNoMortgage35PlusPct: "DP04_0124PE",
  renterUnits: "DP04_0136E",
  medianGrossRent: "DP04_0134E",
  renter30To34: "DP04_0141E",
  renter30To34Pct: "DP04_0141PE",
  renter35Plus: "DP04_0142E",
  renter35PlusPct: "DP04_0142PE",
} as const;

export type CensusAcsHousingCostBurdenCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsHousingCostBurdenInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsHousingCostBurdenCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsHousingCostBurdenIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsHousingCostBurden(
  input: CensusAcsHousingCostBurdenInput,
): Promise<CensusAcsHousingCostBurdenIngestResult> {
  registerCensusAcsHousingCostBurdenSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS housing cost burden ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsHousingCostBurdenUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsHousingCostBurdenIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS housing cost burden request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsHousingCostBurdenResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHousingCostBurdenMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsHousingCostBurdenSource(
  input: CensusAcsHousingCostBurdenInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate housing cost burden",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP04 aggregate owner and renter housing cost burden estimates. This source contains aggregate county-level estimates only and must not be used as individual income, rent, mortgage, or residence evidence.",
  });
}

export function buildCensusAcsHousingCostBurdenUrl(input: {
  year: number;
  county: Pick<CensusAcsHousingCostBurdenCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES)].join(
      ",",
    ),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsHousingCostBurdenResponse(
  payload: unknown,
  input: Pick<CensusAcsHousingCostBurdenInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingCostBurdenCounty,
): AggregateHousingCostBurdenMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS housing cost burden response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error(
      "Census ACS housing cost burden response header is malformed.",
    );
  }

  return rows.map((row) =>
    mapCensusAcsHousingCostBurdenRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsHousingCostBurdenRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsHousingCostBurdenInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsHousingCostBurdenCounty,
): AggregateHousingCostBurdenMetricInput {
  const getValue = createCensusHousingCostBurdenRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;

  const ownerMortgage30To34 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage30To34),
  );
  const ownerMortgage35Plus = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage35Plus),
  );
  const ownerNoMortgage30To34 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage30To34),
  );
  const ownerNoMortgage35Plus = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage35Plus),
  );
  const renter30To34 = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter30To34),
  );
  const renter35Plus = parseCensusInteger(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter35Plus),
  );
  const ownerMortgage30To34Pct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage30To34Pct),
  );
  const ownerMortgage35PlusPct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgage35PlusPct),
  );
  const ownerNoMortgage30To34Pct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage30To34Pct),
  );
  const ownerNoMortgage35PlusPct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgage35PlusPct),
  );
  const renter30To34Pct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter30To34Pct),
  );
  const renter35PlusPct = parseCensusNumber(
    getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renter35PlusPct),
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    ownerMortgageUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerMortgageUnits),
    ),
    ownerMortgage30To34Pct,
    ownerMortgage35PlusPct,
    ownerMortgage30Plus: sumNullable(
      ownerMortgage30To34,
      ownerMortgage35Plus,
    ),
    ownerMortgage30PlusPct: sumNullable(
      ownerMortgage30To34Pct,
      ownerMortgage35PlusPct,
    ),
    ownerNoMortgageUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.ownerNoMortgageUnits),
    ),
    ownerNoMortgage30To34Pct,
    ownerNoMortgage35PlusPct,
    ownerNoMortgage30Plus: sumNullable(
      ownerNoMortgage30To34,
      ownerNoMortgage35Plus,
    ),
    ownerNoMortgage30PlusPct: sumNullable(
      ownerNoMortgage30To34Pct,
      ownerNoMortgage35PlusPct,
    ),
    renterUnits: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.renterUnits),
    ),
    renter30To34Pct,
    renter35PlusPct,
    renter30Plus: sumNullable(renter30To34, renter35Plus),
    renter30PlusPct: sumNullable(renter30To34Pct, renter35PlusPct),
    medianOwnerCostWithMortgage: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES
          .medianOwnerCostWithMortgage,
      ),
    ),
    medianOwnerCostWithoutMortgage: parseCensusInteger(
      getValue(
        CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES
          .medianOwnerCostWithoutMortgage,
      ),
    ),
    medianGrossRent: parseCensusInteger(
      getValue(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES.medianGrossRent),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusHousingCostBurdenRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_HOUSING_COST_BURDEN_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS housing cost burden response missing field: ${field}`,
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
      "Census ACS housing cost burden response was not valid JSON.",
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
      "Census ACS housing cost burden geography FIPS code is missing.",
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
