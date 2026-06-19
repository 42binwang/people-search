import {
  upsertAggregateCountyBusinessMetric,
  upsertApprovedSource,
  type AggregateCountyBusinessMetricInput,
} from "@/lib/db";

export const CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS = {
  naicsCode: "00",
  naicsLabel: "Total for all sectors",
  legalFormCode: "001",
  legalFormLabel: "All establishments",
  employmentSizeCode: "001",
  employmentSizeLabel: "All establishments",
} as const;

export type CensusCbpCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusCbpCountyBusinessInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusCbpCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusCbpCountyBusinessIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusCbpCountyBusiness(
  input: CensusCbpCountyBusinessInput,
): Promise<CensusCbpCountyBusinessIngestResult> {
  registerCensusCbpCountyBusinessSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census CBP county business ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusCbpCountyBusinessUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusCbpCountyBusinessIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census CBP county business request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusCbpCountyBusinessResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateCountyBusinessMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusCbpCountyBusinessSource(
  input: CensusCbpCountyBusinessInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate county business patterns",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.html",
    notes:
      input.notes ??
      "U.S. Census County Business Patterns county-level all-sector establishments, employment, and annual payroll. This source contains aggregate county-year business metrics only and must not be used as evidence of any person's employment, income, employer, residence, benefit status, or eligibility.",
  });
}

export function buildCensusCbpCountyBusinessUrl(input: {
  year: number;
  county: Pick<CensusCbpCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(`https://api.census.gov/data/${input.year}/cbp`);
  url.searchParams.set(
    "get",
    [
      "NAME",
      "ESTAB",
      "EMP",
      "PAYANN",
      "NAICS2017",
      "NAICS2017_LABEL",
      "LFO",
      "LFO_LABEL",
      "EMPSZES",
      "EMPSZES_LABEL",
    ].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("NAICS2017", CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS.naicsCode);
  url.searchParams.set("LFO", CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS.legalFormCode);
  url.searchParams.set(
    "EMPSZES",
    CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS.employmentSizeCode,
  );
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusCbpCountyBusinessResponse(
  payload: unknown,
  input: Pick<CensusCbpCountyBusinessInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusCbpCounty,
): AggregateCountyBusinessMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census CBP county business response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error("Census CBP county business response header is malformed.");
  }

  return rows.map((row) =>
    mapCensusCbpCountyBusinessRow(header, row, input, requestedCounty),
  );
}

export function mapCensusCbpCountyBusinessRow(
  header: string[],
  row: string[],
  input: Pick<CensusCbpCountyBusinessInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusCbpCounty,
): AggregateCountyBusinessMetricInput {
  const getValue = createCensusCbpCountyBusinessRowGetter(header, row);
  const stateFips = normalizeFips(getValue("state") || requestedCounty.state, 2);
  const countyFips = normalizeFips(
    getValue("county") || requestedCounty.county,
    3,
  );

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.year}-${stateFips}${countyFips}-${getValue(
      "NAICS2017",
    )}-${getValue("LFO")}-${getValue("EMPSZES")}`,
    hub: input.hub,
    year: input.year,
    stateFips,
    countyFips,
    countyName: getValue("NAME") || requestedCounty.label,
    naicsCode: getValue("NAICS2017"),
    naicsLabel:
      getValue("NAICS2017_LABEL") ||
      CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS.naicsLabel,
    legalFormCode: getValue("LFO"),
    legalFormLabel:
      getValue("LFO_LABEL") ||
      CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS.legalFormLabel,
    employmentSizeCode: getValue("EMPSZES"),
    employmentSizeLabel:
      getValue("EMPSZES_LABEL") ||
      CENSUS_CBP_COUNTY_BUSINESS_DEFAULTS.employmentSizeLabel,
    establishments: parseCensusInteger(getValue("ESTAB")),
    employment: parseCensusInteger(getValue("EMP")),
    annualPayrollThousands: parseCensusInteger(getValue("PAYANN")),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusCbpCountyBusinessRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "ESTAB",
    "EMP",
    "PAYANN",
    "NAICS2017",
    "LFO",
    "EMPSZES",
    "state",
    "county",
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census CBP county business response missing field: ${field}`,
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
    throw new Error("Census CBP county business response was not valid JSON.");
  }
}

function parseCensusInteger(value: string) {
  if (!value || ["-", "**", "***", "null", "S", "X"].includes(value)) {
    return null;
  }
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error(
      "Census CBP county business geography FIPS code is missing.",
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
