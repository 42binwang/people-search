import {
  upsertAggregateHousingValueRentMetric,
  upsertApprovedSource,
  type AggregateHousingValueRentMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_VALUE_RENT_VARIABLES = {
  ownerValueUnits: "DP04_0080E",
  valueUnder50k: "DP04_0081E",
  valueUnder50kPct: "DP04_0081PE",
  value50kTo99999: "DP04_0082E",
  value50kTo99999Pct: "DP04_0082PE",
  value100kTo149999: "DP04_0083E",
  value100kTo149999Pct: "DP04_0083PE",
  value150kTo199999: "DP04_0084E",
  value150kTo199999Pct: "DP04_0084PE",
  value200kTo299999: "DP04_0085E",
  value200kTo299999Pct: "DP04_0085PE",
  value300kTo499999: "DP04_0086E",
  value300kTo499999Pct: "DP04_0086PE",
  value500kTo999999: "DP04_0087E",
  value500kTo999999Pct: "DP04_0087PE",
  value1mPlus: "DP04_0088E",
  value1mPlusPct: "DP04_0088PE",
  medianHomeValue: "DP04_0089E",
  rentPayingUnits: "DP04_0126E",
  rentUnder500: "DP04_0127E",
  rentUnder500Pct: "DP04_0127PE",
  rent500To999: "DP04_0128E",
  rent500To999Pct: "DP04_0128PE",
  rent1000To1499: "DP04_0129E",
  rent1000To1499Pct: "DP04_0129PE",
  rent1500To1999: "DP04_0130E",
  rent1500To1999Pct: "DP04_0130PE",
  rent2000To2499: "DP04_0131E",
  rent2000To2499Pct: "DP04_0131PE",
  rent2500To2999: "DP04_0132E",
  rent2500To2999Pct: "DP04_0132PE",
  rent3000Plus: "DP04_0133E",
  rent3000PlusPct: "DP04_0133PE",
  medianGrossRent: "DP04_0134E",
  noRentPaid: "DP04_0135E",
  noRentPaidPct: "DP04_0135PE",
} as const;

export type CensusAcsValueRentCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsValueRentInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsValueRentCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsValueRentIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsValueRent(
  input: CensusAcsValueRentInput,
): Promise<CensusAcsValueRentIngestResult> {
  registerCensusAcsValueRentSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS value/rent ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsValueRentUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchCensusAcsValueRentIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS value/rent request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsValueRentResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateHousingValueRentMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsValueRentSource(
  input: CensusAcsValueRentInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate housing value and rent distribution",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP04 aggregate owner-value and gross-rent distribution estimates. This source contains aggregate county-level estimates only and must not be used as individual ownership, lease, sale, address, occupancy, or residence evidence.",
  });
}

export function buildCensusAcsValueRentUrl(input: {
  year: number;
  county: Pick<CensusAcsValueRentCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    ["NAME", ...Object.values(CENSUS_ACS_VALUE_RENT_VARIABLES)].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsValueRentResponse(
  payload: unknown,
  input: Pick<CensusAcsValueRentInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsValueRentCounty,
): AggregateHousingValueRentMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error("Census ACS value/rent response did not include data rows.");
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census ACS value/rent response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusAcsValueRentRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsValueRentRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsValueRentInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsValueRentCounty,
): AggregateHousingValueRentMetricInput {
  const getValue = createCensusValueRentRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );
  const countyName = getValue("NAME") || requestedCounty.label;
  const value500kTo999999 = parseCensusInteger(
    getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value500kTo999999),
  );
  const value1mPlus = parseCensusInteger(
    getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value1mPlus),
  );
  const rent2500To2999 = parseCensusInteger(
    getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent2500To2999),
  );
  const rent3000Plus = parseCensusInteger(
    getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent3000Plus),
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName,
    ownerValueUnits: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.ownerValueUnits),
    ),
    valueUnder50k: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.valueUnder50k),
    ),
    valueUnder50kPct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.valueUnder50kPct),
    ),
    value50kTo99999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value50kTo99999),
    ),
    value50kTo99999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value50kTo99999Pct),
    ),
    value100kTo149999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value100kTo149999),
    ),
    value100kTo149999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value100kTo149999Pct),
    ),
    value150kTo199999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value150kTo199999),
    ),
    value150kTo199999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value150kTo199999Pct),
    ),
    value200kTo299999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value200kTo299999),
    ),
    value200kTo299999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value200kTo299999Pct),
    ),
    value300kTo499999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value300kTo499999),
    ),
    value300kTo499999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value300kTo499999Pct),
    ),
    value500kTo999999,
    value500kTo999999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value500kTo999999Pct),
    ),
    value1mPlus,
    value1mPlusPct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value1mPlusPct),
    ),
    medianHomeValue: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.medianHomeValue),
    ),
    rentPayingUnits: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rentPayingUnits),
    ),
    rentUnder500: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rentUnder500),
    ),
    rentUnder500Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rentUnder500Pct),
    ),
    rent500To999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent500To999),
    ),
    rent500To999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent500To999Pct),
    ),
    rent1000To1499: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent1000To1499),
    ),
    rent1000To1499Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent1000To1499Pct),
    ),
    rent1500To1999: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent1500To1999),
    ),
    rent1500To1999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent1500To1999Pct),
    ),
    rent2000To2499: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent2000To2499),
    ),
    rent2000To2499Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent2000To2499Pct),
    ),
    rent2500To2999,
    rent2500To2999Pct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent2500To2999Pct),
    ),
    rent3000Plus,
    rent3000PlusPct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent3000PlusPct),
    ),
    medianGrossRent: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.medianGrossRent),
    ),
    noRentPaid: parseCensusInteger(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.noRentPaid),
    ),
    noRentPaidPct: parseCensusNumber(
      getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.noRentPaidPct),
    ),
    value500kPlus: sumNullable(value500kTo999999, value1mPlus),
    value500kPlusPct: sumNullable(
      parseCensusNumber(
        getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value500kTo999999Pct),
      ),
      parseCensusNumber(getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.value1mPlusPct)),
    ),
    rent2500Plus: sumNullable(rent2500To2999, rent3000Plus),
    rent2500PlusPct: sumNullable(
      parseCensusNumber(
        getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent2500To2999Pct),
      ),
      parseCensusNumber(getValue(CENSUS_ACS_VALUE_RENT_VARIABLES.rent3000PlusPct)),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusValueRentRowGetter(header: string[], row: string[]) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_VALUE_RENT_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(`Census ACS value/rent response missing field: ${field}`);
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
    throw new Error("Census ACS value/rent response was not valid JSON.");
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
    throw new Error("Census ACS value/rent geography FIPS code is missing.");
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
