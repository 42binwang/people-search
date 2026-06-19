import {
  upsertAggregateLausLaborMetric,
  upsertApprovedSource,
  type AggregateLausLaborMetricInput,
} from "@/lib/db";

export const BLS_LAUS_MEASURES = {
  unemploymentRate: "3",
  unemployment: "4",
  employment: "5",
  laborForce: "6",
} as const;

export type BlsLausCounty = {
  label: string;
  state: string;
  county: string;
};

export type BlsLausCountyLaborInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  startYear: number;
  endYear: number;
  counties: BlsLausCounty[];
  endpointUrl?: string;
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  apiKey?: string;
};

export type BlsLausCountyLaborIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type BlsSeries = {
  seriesID?: string;
  data?: Array<{
    year?: string;
    period?: string;
    periodName?: string;
    value?: string;
    footnotes?: Array<{ code?: string; text?: string }>;
  }>;
};

type BlsResponse = {
  status?: string;
  message?: string[];
  Results?: {
    series?: BlsSeries[];
  };
};

type MetricAccumulator = Omit<
  AggregateLausLaborMetricInput,
  "laborForce" | "employment" | "unemployment" | "unemploymentRate" | "raw"
> & {
  laborForce?: number | null;
  employment?: number | null;
  unemployment?: number | null;
  unemploymentRate?: number | null;
  rawSeries: Record<string, unknown>;
};

export async function ingestBlsLausCountyLabor(
  input: BlsLausCountyLaborInput,
): Promise<BlsLausCountyLaborIngestResult> {
  registerBlsLausCountyLaborSource(input);

  const urls: string[] = [];
  const metrics: AggregateLausLaborMetricInput[] = [];

  for (const county of input.counties) {
    const request = buildBlsLausCountyLaborRequest(input, county);
    urls.push(request.url);

    const response = await fetch(request.url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "PeopleSearchBlsLausCountyLaborIngest/0.1 local-development",
      },
      body: request.body,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `BLS LAUS county labor request failed: ${response.status} ${response.statusText}`,
      );
    }

    metrics.push(
      ...parseBlsLausCountyLaborResponse(
        await parseBlsJson(response),
        input,
        county,
      ),
    );
  }

  for (const metric of metrics) {
    upsertAggregateLausLaborMetric(metric);
  }

  return {
    fetched: metrics.length,
    imported: metrics.length,
    urls,
  };
}

export function registerBlsLausCountyLaborSource(
  input: BlsLausCountyLaborInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate local labor force",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ?? "https://www.bls.gov/developers/termsOfService.htm",
    notes:
      input.notes ??
      "U.S. Bureau of Labor Statistics Local Area Unemployment Statistics county-level labor force, employment, unemployment, and unemployment-rate estimates. This source contains aggregate county-month metrics only and must not be used as evidence of any person's employment, unemployment, income, residence, employer, benefit status, or eligibility.",
  });
}

export function buildBlsLausCountyLaborRequest(
  input: Pick<
    BlsLausCountyLaborInput,
    "startYear" | "endYear" | "endpointUrl" | "apiKey"
  >,
  county: BlsLausCounty,
) {
  const url =
    input.endpointUrl ?? "https://api.bls.gov/publicAPI/v2/timeseries/data/";
  const body: Record<string, unknown> = {
    seriesid: Object.values(buildBlsLausCountySeriesIds(county)),
    startyear: String(input.startYear),
    endyear: String(input.endYear),
  };
  const registrationKey = input.apiKey || process.env.BLS_API_KEY;
  if (registrationKey) {
    body.registrationkey = registrationKey;
  }

  return {
    url,
    body: JSON.stringify(body),
  };
}

export function buildBlsLausCountySeriesIds(county: BlsLausCounty) {
  const geocode = `${normalizeFips(county.state, 2)}${normalizeFips(
    county.county,
    3,
  )}`;
  return {
    unemploymentRate: buildBlsLausSeriesId(geocode, BLS_LAUS_MEASURES.unemploymentRate),
    unemployment: buildBlsLausSeriesId(geocode, BLS_LAUS_MEASURES.unemployment),
    employment: buildBlsLausSeriesId(geocode, BLS_LAUS_MEASURES.employment),
    laborForce: buildBlsLausSeriesId(geocode, BLS_LAUS_MEASURES.laborForce),
  };
}

export function buildBlsLausSeriesId(geocode: string, measure: string) {
  return `LAUCN${geocode}000000000${measure}`;
}

export function parseBlsLausCountyLaborResponse(
  payload: unknown,
  input: Pick<BlsLausCountyLaborInput, "sourceId" | "hub">,
  county: BlsLausCounty,
): AggregateLausLaborMetricInput[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("BLS LAUS county labor response was not an object.");
  }

  const data = payload as BlsResponse;
  if (data.status !== "REQUEST_SUCCEEDED") {
    throw new Error(
      `BLS LAUS county labor request was not successful: ${
        data.status ?? "unknown"
      }`,
    );
  }

  const series = data.Results?.series;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("BLS LAUS county labor response did not include series.");
  }

  return mapBlsLausCountyLaborSeries(series, input, county);
}

export function mapBlsLausCountyLaborSeries(
  series: BlsSeries[],
  input: Pick<BlsLausCountyLaborInput, "sourceId" | "hub">,
  county: BlsLausCounty,
): AggregateLausLaborMetricInput[] {
  const seriesIds = buildBlsLausCountySeriesIds(county);
  const seriesToField = new Map<string, keyof typeof seriesIds>(
    Object.entries(seriesIds).map(([field, seriesId]) => [
      seriesId,
      field as keyof typeof seriesIds,
    ]),
  );
  const stateFips = normalizeFips(county.state, 2);
  const countyFips = normalizeFips(county.county, 3);
  const rows = new Map<string, MetricAccumulator>();

  for (const item of series) {
    const field = item.seriesID ? seriesToField.get(item.seriesID) : undefined;
    if (!field) {
      continue;
    }

    for (const point of item.data ?? []) {
      if (!point.year || !point.period || point.period === "M13") {
        continue;
      }
      const key = `${point.year}-${point.period}`;
      const row =
        rows.get(key) ??
        createMetricAccumulator(input, county, {
          stateFips,
          countyFips,
          year: parseInteger(point.year),
          period: point.period,
          periodName: point.periodName ?? point.period,
        });
      row[field] = parseNumber(point.value);
      row.rawSeries[field] = point;
      rows.set(key, row);
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      laborForce: row.laborForce ?? null,
      employment: row.employment ?? null,
      unemployment: row.unemployment ?? null,
      unemploymentRate: row.unemploymentRate ?? null,
      raw: {
        seriesIds,
        series: row.rawSeries,
      },
    }))
    .sort(
      (left, right) =>
        left.year - right.year || left.period.localeCompare(right.period),
    );
}

function createMetricAccumulator(
  input: Pick<BlsLausCountyLaborInput, "sourceId" | "hub">,
  county: BlsLausCounty,
  values: {
    stateFips: string;
    countyFips: string;
    year: number | null;
    period: string;
    periodName: string;
  },
): MetricAccumulator {
  if (values.year === null) {
    throw new Error("BLS LAUS county labor response included invalid year.");
  }

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${values.year}-${values.stateFips}${values.countyFips}-${values.period}`,
    hub: input.hub,
    year: values.year,
    period: values.period,
    periodName: values.periodName,
    stateFips: values.stateFips,
    countyFips: values.countyFips,
    countyName: county.label,
    rawSeries: {},
  };
}

async function parseBlsJson(response: Response): Promise<BlsResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as BlsResponse;
  } catch {
    throw new Error("BLS LAUS county labor response was not valid JSON.");
  }
}

function parseInteger(value: unknown) {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function parseNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || ["-", "**", "***", "null"].includes(text)) {
    return null;
  }
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFips(value: string, length: number) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("BLS LAUS county labor geography FIPS code is missing.");
  }
  return digits.padStart(length, "0").slice(-length);
}
