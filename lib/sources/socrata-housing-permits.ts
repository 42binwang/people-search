import {
  upsertAggregateHousingPermitMetric,
  upsertApprovedSource,
  type AggregateHousingPermitMetricInput,
} from "@/lib/db";

export type SocrataHousingPermitsFields = {
  date: string;
  category: string;
  unitsAdded?: string;
  unitsRemoved?: string;
  estimatedCost?: string;
};

export type SocrataHousingPermitsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  city: string;
  state: string;
  domain: string;
  datasetId: string;
  fields: SocrataHousingPermitsFields;
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  where?: string;
  pageSize?: number;
  maxPages?: number;
};

export type SocrataHousingPermitsIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestSocrataHousingPermits(
  input: SocrataHousingPermitsInput,
): Promise<SocrataHousingPermitsIngestResult> {
  registerSocrataHousingPermitsSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 5000);
  const maxPages = clampPositiveInteger(input.maxPages, 20);
  const baseUrl = buildSocrataHousingPermitsUrl(input, pageSize, 0);
  const allRows: SocrataHousingPermitRow[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildSocrataHousingPermitsUrl(input, pageSize, page * pageSize);
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchSocrataHousingPermitsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Socrata housing permits request failed: ${response.status} ${response.statusText}`,
      );
    }

    const rows = await parseSocrataRows(response);
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
  }

  const metrics = aggregateSocrataHousingPermitRows(allRows, input);
  for (const metric of metrics) {
    upsertAggregateHousingPermitMetric(metric);
  }

  return {
    fetched: allRows.length,
    imported: metrics.length,
    url: baseUrl,
  };
}

export function registerSocrataHousingPermitsSource(
  input: SocrataHousingPermitsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate residential permit activity",
    jurisdiction: input.jurisdiction ?? input.city,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? `https://${input.domain}`,
    notes:
      input.notes ??
      "Official Socrata open-data permit records aggregated by month and permit category. Only non-personal fields are selected and stored.",
  });
}

export function buildSocrataHousingPermitsUrl(
  input: SocrataHousingPermitsInput,
  limit = 5000,
  offset = 0,
) {
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = new URL(`https://${domain}/resource/${input.datasetId}.json`);
  url.searchParams.set(
    "$select",
    unique([
      input.fields.date,
      input.fields.category,
      input.fields.unitsAdded,
      input.fields.unitsRemoved,
      input.fields.estimatedCost,
    ]).join(","),
  );
  if (input.where) {
    url.searchParams.set("$where", input.where);
  }
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));

  return url.toString();
}

export function aggregateSocrataHousingPermitRows(
  rows: SocrataHousingPermitRow[],
  input: Pick<
    SocrataHousingPermitsInput,
    "sourceId" | "hub" | "city" | "state" | "fields"
  >,
): AggregateHousingPermitMetricInput[] {
  const groups = new Map<string, HousingPermitAccumulator>();

  for (const row of rows) {
    const dateValue = clean(row[input.fields.date]);
    const periodMonth = toPeriodMonth(dateValue);
    const category = clean(row[input.fields.category]) || "Unknown";
    const key = `${periodMonth}|${category}`;
    const current =
      groups.get(key) ??
      ({
        periodMonth,
        category,
        permitCount: 0,
        housingUnitsAdded: 0,
        housingUnitsRemoved: 0,
        estimatedCost: 0,
        hasUnitsAdded: false,
        hasUnitsRemoved: false,
        hasEstimatedCost: false,
      } satisfies HousingPermitAccumulator);

    current.permitCount += 1;

    const added = parseOptionalNumber(
      input.fields.unitsAdded ? row[input.fields.unitsAdded] : undefined,
    );
    if (added !== null) {
      current.housingUnitsAdded += Math.round(added);
      current.hasUnitsAdded = true;
    }

    const removed = parseOptionalNumber(
      input.fields.unitsRemoved ? row[input.fields.unitsRemoved] : undefined,
    );
    if (removed !== null) {
      current.housingUnitsRemoved += Math.round(removed);
      current.hasUnitsRemoved = true;
    }

    const cost = parseOptionalNumber(
      input.fields.estimatedCost ? row[input.fields.estimatedCost] : undefined,
    );
    if (cost !== null) {
      current.estimatedCost += cost;
      current.hasEstimatedCost = true;
    }

    groups.set(key, current);
  }

  return Array.from(groups.values())
    .sort((left, right) =>
      `${left.periodMonth}|${left.category}`.localeCompare(
        `${right.periodMonth}|${right.category}`,
      ),
    )
    .map((group) => {
      const housingUnitsAdded = group.hasUnitsAdded
        ? group.housingUnitsAdded
        : null;
      const housingUnitsRemoved = group.hasUnitsRemoved
        ? group.housingUnitsRemoved
        : null;
      const netHousingUnits =
        housingUnitsAdded === null && housingUnitsRemoved === null
          ? null
          : (housingUnitsAdded ?? 0) - (housingUnitsRemoved ?? 0);

      return {
        sourceId: input.sourceId,
        sourceRecordId: `${group.periodMonth}-${slugify(group.category)}`,
        hub: input.hub,
        city: input.city,
        state: input.state.toUpperCase(),
        periodMonth: group.periodMonth,
        category: group.category,
        permitCount: group.permitCount,
        housingUnitsAdded,
        housingUnitsRemoved,
        netHousingUnits,
        estimatedCost: group.hasEstimatedCost ? group.estimatedCost : null,
        raw: {
          periodMonth: group.periodMonth,
          category: group.category,
          aggregatedRows: group.permitCount,
        },
      };
    });
}

async function parseSocrataRows(
  response: Response,
): Promise<SocrataHousingPermitRow[]> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Socrata housing permits response was not valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Socrata housing permits response was not an array.");
  }

  return parsed.filter(isSocrataHousingPermitRow);
}

function isSocrataHousingPermitRow(
  value: unknown,
): value is SocrataHousingPermitRow {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toPeriodMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) {
    throw new Error(`Socrata housing permit row has invalid date: ${value}`);
  }
  return `${match[1]}-${match[2]}`;
}

function parseOptionalNumber(value: unknown) {
  const cleaned = clean(value).replace(/[$,]/g, "");
  if (!cleaned || ["-", "**", "***", "null"].includes(cleaned)) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPositiveInteger(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && value && value > 0
    ? Math.floor(value)
    : fallback;
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "unknown";
}

type HousingPermitAccumulator = {
  periodMonth: string;
  category: string;
  permitCount: number;
  housingUnitsAdded: number;
  housingUnitsRemoved: number;
  estimatedCost: number;
  hasUnitsAdded: boolean;
  hasUnitsRemoved: boolean;
  hasEstimatedCost: boolean;
};

export type SocrataHousingPermitRow = Record<string, unknown>;
