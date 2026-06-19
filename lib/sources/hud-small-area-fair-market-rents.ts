import {
  upsertAggregateSmallAreaFairMarketRentMetric,
  upsertApprovedSource,
  type AggregateSmallAreaFairMarketRentMetricInput,
} from "@/lib/db";

export type HudSmallAreaFairMarketRentArea = {
  label: string;
  name: string;
};

export type HudSmallAreaFairMarketRentsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  tableUrl: string;
  fiscalYear: number;
  areas: HudSmallAreaFairMarketRentArea[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudSmallAreaFairMarketRentsIngestResult = {
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
  "HUD_CODE",
  "FMR_NAME",
  "ID",
  "ZCTA_ID",
  "SAFMR_0BR",
  "SAFMR_0BR_90_Payment_Standard",
  "SAFMR_0BR_110_Payment_Standard",
  "SAFMR_1BR",
  "SAFMR_1BR_90_Payment_Standard",
  "SAFMR_1BR_110_Payment_Standard",
  "SAFMR_2BR",
  "SAFMR_2BR_90_Payment_Standard",
  "SAFMR_2BR_110_Payment_Standard",
  "SAFMR_3BR",
  "SAFMR_3BR_90_Payment_Standard",
  "SAFMR_3BR_110_Payment_Standard",
  "SAFMR_4BR",
  "SAFMR_4BR_90_Payment_Standard",
  "SAFMR_4BR_110_Payment_Standard",
] as const;

export async function ingestHudSmallAreaFairMarketRents(
  input: HudSmallAreaFairMarketRentsInput,
): Promise<HudSmallAreaFairMarketRentsIngestResult> {
  registerHudSmallAreaFairMarketRentsSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 1000, 1000);
  const maxPages = clampPositiveInteger(input.maxPages, 50, 100);
  const urls: string[] = [];
  const metrics: AggregateSmallAreaFairMarketRentMetricInput[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudSmallAreaFairMarketRentsUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchHudSmallAreaFairMarketRentsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD small area fair market rents request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    metrics.push(...parseHudSmallAreaFairMarketRentFeatures(pageFeatures, input));

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  for (const metric of metrics) {
    upsertAggregateSmallAreaFairMarketRentMetric(metric);
  }

  return {
    fetched: metrics.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudSmallAreaFairMarketRentsSource(
  input: HudSmallAreaFairMarketRentsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate small area fair market rents",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::small-area-fair-market-rents/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS table for Small Area Fair Market Rents. This adapter stores ZIP/ZCTA-level rent and payment-standard values for configured HUD FMR areas only and does not request geometry, addresses, people, households, owners, contacts, or parcel records.",
  });
}

export function buildHudSmallAreaFairMarketRentsUrl(
  input: Pick<HudSmallAreaFairMarketRentsInput, "tableUrl" | "areas">,
  options: { offset?: number; pageSize?: number } = {},
) {
  const pageSize = clampPositiveInteger(options.pageSize, 1000, 1000);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const url = new URL(`${input.tableUrl.replace(/\/+$/, "")}/query`);

  url.searchParams.set("f", "json");
  url.searchParams.set("where", buildAreaWhereClause(input.areas));
  url.searchParams.set("outFields", OUT_FIELDS.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(pageSize));

  return url.toString();
}

export function parseHudSmallAreaFairMarketRentFeatures(
  features: ArcGisFeature[],
  input: Pick<
    HudSmallAreaFairMarketRentsInput,
    "sourceId" | "hub" | "fiscalYear" | "areas"
  >,
): AggregateSmallAreaFairMarketRentMetricInput[] {
  const targetAreaLabels = new Map(
    input.areas.map((area) => [normalizeAreaName(area.name), area.label]),
  );

  return features
    .map((feature) => mapHudSmallAreaFairMarketRentFeature(feature, input))
    .filter((metric) =>
      targetAreaLabels.has(normalizeAreaName(metric.fmrName)),
    )
    .map((metric) => ({
      ...metric,
      fmrName:
        targetAreaLabels.get(normalizeAreaName(metric.fmrName)) ??
        metric.fmrName,
    }))
    .sort((left, right) =>
      `${left.fmrName}-${left.zcta}`.localeCompare(`${right.fmrName}-${right.zcta}`),
    );
}

export function mapHudSmallAreaFairMarketRentFeature(
  feature: ArcGisFeature,
  input: Pick<
    HudSmallAreaFairMarketRentsInput,
    "sourceId" | "hub" | "fiscalYear"
  >,
): AggregateSmallAreaFairMarketRentMetricInput {
  const attributes = feature.attributes ?? {};
  for (const field of OUT_FIELDS) {
    if (!(field in attributes)) {
      throw new Error(`HUD SAFMR response missing field: ${field}`);
    }
  }

  const hudCode = cleanText(attributes.HUD_CODE);
  const fmrName = cleanText(attributes.FMR_NAME);
  const zcta = normalizeZcta(attributes.ZCTA_ID) || normalizeZcta(attributes.ID);
  if (!hudCode || !fmrName || !zcta) {
    throw new Error("HUD SAFMR response missing HUD code, FMR name, or ZCTA.");
  }

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${input.fiscalYear}-${hudCode}-${zcta}`,
    hub: input.hub,
    fiscalYear: input.fiscalYear,
    hudCode,
    fmrName,
    zcta,
    safmr0br: parseInteger(attributes.SAFMR_0BR),
    safmr0brPaymentStandard90: parseInteger(
      attributes.SAFMR_0BR_90_Payment_Standard,
    ),
    safmr0brPaymentStandard110: parseInteger(
      attributes.SAFMR_0BR_110_Payment_Standard,
    ),
    safmr1br: parseInteger(attributes.SAFMR_1BR),
    safmr1brPaymentStandard90: parseInteger(
      attributes.SAFMR_1BR_90_Payment_Standard,
    ),
    safmr1brPaymentStandard110: parseInteger(
      attributes.SAFMR_1BR_110_Payment_Standard,
    ),
    safmr2br: parseInteger(attributes.SAFMR_2BR),
    safmr2brPaymentStandard90: parseInteger(
      attributes.SAFMR_2BR_90_Payment_Standard,
    ),
    safmr2brPaymentStandard110: parseInteger(
      attributes.SAFMR_2BR_110_Payment_Standard,
    ),
    safmr3br: parseInteger(attributes.SAFMR_3BR),
    safmr3brPaymentStandard90: parseInteger(
      attributes.SAFMR_3BR_90_Payment_Standard,
    ),
    safmr3brPaymentStandard110: parseInteger(
      attributes.SAFMR_3BR_110_Payment_Standard,
    ),
    safmr4br: parseInteger(attributes.SAFMR_4BR),
    safmr4brPaymentStandard90: parseInteger(
      attributes.SAFMR_4BR_90_Payment_Standard,
    ),
    safmr4brPaymentStandard110: parseInteger(
      attributes.SAFMR_4BR_110_Payment_Standard,
    ),
    raw: {
      fieldPolicy:
        "HUD SAFMR rent and payment-standard values by ZCTA and HUD FMR area.",
    },
  };
}

function buildAreaWhereClause(areas: HudSmallAreaFairMarketRentArea[]) {
  if (areas.length === 0) {
    throw new Error("HUD SAFMR config needs areas.");
  }

  const quotedAreaNames = Array.from(
    new Set(areas.map((area) => cleanText(area.name)).filter(Boolean)),
  )
    .sort()
    .map((areaName) => `'${areaName.replace(/'/g, "''")}'`)
    .join(",");

  if (!quotedAreaNames) {
    throw new Error("HUD SAFMR config needs area names.");
  }

  return `FMR_NAME IN (${quotedAreaNames})`;
}

async function parseArcGisJson(response: Response): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("HUD small area fair market rents response was not valid JSON.");
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD small area fair market rents response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD small area fair market rents features were malformed.");
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

function normalizeZcta(value: unknown) {
  const zcta = cleanText(value).replace(/\D/g, "");
  return zcta.length === 5 ? zcta : "";
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
