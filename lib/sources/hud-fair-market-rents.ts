import {
  upsertAggregateFairMarketRentMetric,
  upsertApprovedSource,
  type AggregateFairMarketRentMetricInput,
} from "@/lib/db";

export type HudFairMarketRentArea = {
  label: string;
  name: string;
};

export type HudFairMarketRentsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  fiscalYear: number;
  areas: HudFairMarketRentArea[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudFairMarketRentsIngestResult = {
  fetched: number;
  imported: number;
  urls: string[];
};

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
};

type ArcGisQueryPayload = {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

const OUT_FIELDS = [
  "FMR_CODE",
  "FMR_AREANAME",
  "FMR_0BDR",
  "FMR_1BDR",
  "FMR_2BDR",
  "FMR_3BDR",
  "FMR_4BDR",
] as const;

export async function ingestHudFairMarketRents(
  input: HudFairMarketRentsInput,
): Promise<HudFairMarketRentsIngestResult> {
  registerHudFairMarketRentsSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 1000, 1000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  const metrics: AggregateFairMarketRentMetricInput[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudFairMarketRentsUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchHudFairMarketRentsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD fair market rents request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    metrics.push(...parseHudFairMarketRentFeatures(pageFeatures, input));

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  for (const metric of metrics) {
    upsertAggregateFairMarketRentMetric(metric);
  }

  return {
    fetched: metrics.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudFairMarketRentsSource(
  input: HudFairMarketRentsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate fair market rents",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::fair-market-rents/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for Fair Market Rents. This adapter stores area-level rent values for configured HUD FMR areas only and does not request geometry, addresses, people, households, owners, contacts, or parcel records.",
  });
}

export function buildHudFairMarketRentsUrl(
  input: Pick<HudFairMarketRentsInput, "layerUrl" | "areas">,
  options: { offset?: number; pageSize?: number } = {},
) {
  const pageSize = clampPositiveInteger(options.pageSize, 1000, 1000);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const url = new URL(`${input.layerUrl.replace(/\/+$/, "")}/query`);

  url.searchParams.set("f", "json");
  url.searchParams.set("where", buildAreaWhereClause(input.areas));
  url.searchParams.set("outFields", OUT_FIELDS.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(pageSize));

  return url.toString();
}

export function parseHudFairMarketRentFeatures(
  features: ArcGisFeature[],
  input: Pick<
    HudFairMarketRentsInput,
    "sourceId" | "hub" | "fiscalYear" | "areas"
  >,
): AggregateFairMarketRentMetricInput[] {
  const targetAreaLabels = new Map(
    input.areas.map((area) => [normalizeAreaName(area.name), area.label]),
  );

  return features
    .map((feature) => mapHudFairMarketRentFeature(feature, input))
    .filter((metric) =>
      targetAreaLabels.has(normalizeAreaName(metric.fmrName)),
    )
    .map((metric) => ({
      ...metric,
      fmrName:
        targetAreaLabels.get(normalizeAreaName(metric.fmrName)) ??
        metric.fmrName,
    }))
    .sort((left, right) => left.fmrName.localeCompare(right.fmrName));
}

export function mapHudFairMarketRentFeature(
  feature: ArcGisFeature,
  input: Pick<HudFairMarketRentsInput, "sourceId" | "hub" | "fiscalYear">,
): AggregateFairMarketRentMetricInput {
  const attributes = feature.attributes ?? {};
  for (const field of OUT_FIELDS) {
    if (!(field in attributes)) {
      throw new Error(`HUD FMR response missing field: ${field}`);
    }
  }

  const fmrCode = cleanText(attributes.FMR_CODE);
  const fmrName = cleanText(attributes.FMR_AREANAME);
  if (!fmrCode || !fmrName) {
    throw new Error("HUD FMR response missing FMR code or area name.");
  }

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.fiscalYear}-${fmrCode}`,
    hub: input.hub,
    fiscalYear: input.fiscalYear,
    fmrCode,
    fmrName,
    fmr0br: parseInteger(attributes.FMR_0BDR),
    fmr1br: parseInteger(attributes.FMR_1BDR),
    fmr2br: parseInteger(attributes.FMR_2BDR),
    fmr3br: parseInteger(attributes.FMR_3BDR),
    fmr4br: parseInteger(attributes.FMR_4BDR),
    raw: {
      fieldPolicy:
        "HUD FMR area-level rent values by bedroom count and HUD FMR area.",
    },
  };
}

function buildAreaWhereClause(areas: HudFairMarketRentArea[]) {
  if (areas.length === 0) {
    throw new Error("HUD FMR config needs areas.");
  }

  const quotedAreaNames = Array.from(
    new Set(areas.map((area) => cleanText(area.name)).filter(Boolean)),
  )
    .sort()
    .map((areaName) => `'${areaName.replace(/'/g, "''")}'`)
    .join(",");

  if (!quotedAreaNames) {
    throw new Error("HUD FMR config needs area names.");
  }

  return `FMR_AREANAME IN (${quotedAreaNames})`;
}

async function parseArcGisJson(response: Response): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("HUD fair market rents response was not valid JSON.");
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD fair market rents response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD fair market rents features were malformed.");
  }

  return parsed;
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAreaName(value: string) {
  return cleanText(value).toLowerCase();
}

function parseInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  const cleaned = cleanText(value).replace(/[$,]/g, "");
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "null") {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function clampPositiveInteger(
  value: number | undefined,
  fallback: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), max);
}
