import {
  upsertAggregateEducationalAttainmentMetric,
  upsertApprovedSource,
  type AggregateEducationalAttainmentMetricInput,
} from "@/lib/db";

export const CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES = {
  population25Plus: "DP02_0059E",
  lessThan9thGrade: "DP02_0060E",
  lessThan9thGradePct: "DP02_0060PE",
  ninthTo12thNoDiploma: "DP02_0061E",
  ninthTo12thNoDiplomaPct: "DP02_0061PE",
  highSchoolGraduate: "DP02_0062E",
  highSchoolGraduatePct: "DP02_0062PE",
  someCollegeNoDegree: "DP02_0063E",
  someCollegeNoDegreePct: "DP02_0063PE",
  associatesDegree: "DP02_0064E",
  associatesDegreePct: "DP02_0064PE",
  bachelorsDegree: "DP02_0065E",
  bachelorsDegreePct: "DP02_0065PE",
  graduateProfessionalDegree: "DP02_0066E",
  graduateProfessionalDegreePct: "DP02_0066PE",
  highSchoolGraduateOrHigher: "DP02_0067E",
  highSchoolGraduateOrHigherPct: "DP02_0067PE",
  bachelorsDegreeOrHigher: "DP02_0068E",
  bachelorsDegreeOrHigherPct: "DP02_0068PE",
} as const;

export type CensusAcsEducationalAttainmentCounty = {
  label: string;
  state: string;
  county: string;
};

export type CensusAcsEducationalAttainmentInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  year: number;
  counties: CensusAcsEducationalAttainmentCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type CensusAcsEducationalAttainmentIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type CensusResponse = Array<string[]>;

export async function ingestCensusAcsEducationalAttainment(
  input: CensusAcsEducationalAttainmentInput,
): Promise<CensusAcsEducationalAttainmentIngestResult> {
  registerCensusAcsEducationalAttainmentSource(input);

  const apiKey = input.apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Census ACS educational attainment ingestion requires CENSUS_API_KEY or config.apiKey.",
    );
  }

  let fetched = 0;
  let imported = 0;
  const urls: string[] = [];

  for (const county of input.counties) {
    const url = buildCensusAcsEducationalAttainmentUrl({
      year: input.year,
      county,
      apiKey,
    });
    urls.push(redactApiKey(url));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchCensusAcsEducationalAttainmentIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Census ACS educational attainment request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metrics = parseCensusAcsEducationalAttainmentResponse(
      await parseCensusJson(response),
      input,
      county,
    );
    fetched += metrics.length;

    for (const metric of metrics) {
      upsertAggregateEducationalAttainmentMetric(metric);
      imported += 1;
    }
  }

  return { fetched, imported, urls };
}

export function registerCensusAcsEducationalAttainmentSource(
  input: CensusAcsEducationalAttainmentInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate educational attainment",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      `https://www.census.gov/data/developers/data-sets/acs-5year/${input.year}.html`,
    notes:
      input.notes ??
      "U.S. Census ACS 5-year Data Profile DP02 aggregate county estimates for educational attainment. This source contains aggregate county-level estimates only and must not be used as evidence of any person's education, income, employment, residence, or household finances.",
  });
}

export function buildCensusAcsEducationalAttainmentUrl(input: {
  year: number;
  county: Pick<CensusAcsEducationalAttainmentCounty, "state" | "county">;
  apiKey: string;
}) {
  const url = new URL(
    `https://api.census.gov/data/${input.year}/acs/acs5/profile`,
  );
  url.searchParams.set(
    "get",
    [
      "NAME",
      ...Object.values(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES),
    ].join(","),
  );
  url.searchParams.set("for", `county:${normalizeFips(input.county.county, 3)}`);
  url.searchParams.set("in", `state:${normalizeFips(input.county.state, 2)}`);
  url.searchParams.set("key", input.apiKey);
  return url.toString();
}

export function parseCensusAcsEducationalAttainmentResponse(
  payload: unknown,
  input: Pick<CensusAcsEducationalAttainmentInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsEducationalAttainmentCounty,
): AggregateEducationalAttainmentMetricInput[] {
  if (!Array.isArray(payload) || payload.length < 2) {
    throw new Error(
      "Census ACS educational attainment response did not include data rows.",
    );
  }

  const [header, ...rows] = payload as CensusResponse;
  if (!Array.isArray(header) || header.length === 0) {
    throw new Error(
      "Census ACS educational attainment response header is malformed.",
    );
  }

  return rows.map((row) =>
    mapCensusAcsEducationalAttainmentRow(header, row, input, requestedCounty),
  );
}

export function mapCensusAcsEducationalAttainmentRow(
  header: string[],
  row: string[],
  input: Pick<CensusAcsEducationalAttainmentInput, "sourceId" | "hub" | "year">,
  requestedCounty: CensusAcsEducationalAttainmentCounty,
): AggregateEducationalAttainmentMetricInput {
  const getValue = createCensusEducationalAttainmentRowGetter(header, row);
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
    population25Plus: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.population25Plus),
    ),
    lessThan9thGrade: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.lessThan9thGrade),
    ),
    lessThan9thGradePct: parseCensusNumber(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.lessThan9thGradePct),
    ),
    ninthTo12thNoDiploma: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.ninthTo12thNoDiploma),
    ),
    ninthTo12thNoDiplomaPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.ninthTo12thNoDiplomaPct,
      ),
    ),
    highSchoolGraduate: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.highSchoolGraduate),
    ),
    highSchoolGraduatePct: parseCensusNumber(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.highSchoolGraduatePct),
    ),
    someCollegeNoDegree: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.someCollegeNoDegree),
    ),
    someCollegeNoDegreePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.someCollegeNoDegreePct,
      ),
    ),
    associatesDegree: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.associatesDegree),
    ),
    associatesDegreePct: parseCensusNumber(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.associatesDegreePct),
    ),
    bachelorsDegree: parseCensusInteger(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.bachelorsDegree),
    ),
    bachelorsDegreePct: parseCensusNumber(
      getValue(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.bachelorsDegreePct),
    ),
    graduateProfessionalDegree: parseCensusInteger(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.graduateProfessionalDegree,
      ),
    ),
    graduateProfessionalDegreePct: parseCensusNumber(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.graduateProfessionalDegreePct,
      ),
    ),
    highSchoolGraduateOrHigher: parseCensusInteger(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.highSchoolGraduateOrHigher,
      ),
    ),
    highSchoolGraduateOrHigherPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.highSchoolGraduateOrHigherPct,
      ),
    ),
    bachelorsDegreeOrHigher: parseCensusInteger(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.bachelorsDegreeOrHigher,
      ),
    ),
    bachelorsDegreeOrHigherPct: parseCensusNumber(
      getValue(
        CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES.bachelorsDegreeOrHigherPct,
      ),
    ),
    raw: Object.fromEntries(
      header.map((field, index) => [field, row[index] ?? null]),
    ),
  };
}

function createCensusEducationalAttainmentRowGetter(
  header: string[],
  row: string[],
) {
  const fieldIndexes = new Map(header.map((field, index) => [field, index]));

  for (const field of [
    "NAME",
    "state",
    "county",
    ...Object.values(CENSUS_ACS_EDUCATIONAL_ATTAINMENT_VARIABLES),
  ]) {
    if (!fieldIndexes.has(field)) {
      throw new Error(
        `Census ACS educational attainment response missing field: ${field}`,
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
      "Census ACS educational attainment response was not valid JSON.",
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
      "Census ACS educational attainment geography FIPS code is missing.",
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
