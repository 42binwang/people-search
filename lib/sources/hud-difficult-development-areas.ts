import {
  upsertAggregateLihtcDifficultDevelopmentAreaMetric,
  upsertApprovedSource,
  type AggregateLihtcDifficultDevelopmentAreaMetricInput,
} from "@/lib/db";

export type HudDifficultDevelopmentArea = {
  label: string;
  name: string;
};

export type HudDifficultDevelopmentAreasInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  fiscalYear: number;
  areas: HudDifficultDevelopmentArea[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudDifficultDevelopmentAreasIngestResult = {
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

const OUT_FIELDS = ["ZCTA5", "DDA_CODE", "DDA_TYPE", "DDA_NAME"] as const;

export async function ingestHudDifficultDevelopmentAreas(
  input: HudDifficultDevelopmentAreasInput,
): Promise<HudDifficultDevelopmentAreasIngestResult> {
  registerHudDifficultDevelopmentAreasSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 2000, 2000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  const features: ArcGisFeature[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudDifficultDevelopmentAreasUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchHudDifficultDevelopmentAreasIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD difficult development areas request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    features.push(...pageFeatures);

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  const metrics = aggregateHudDifficultDevelopmentAreas(features, input);
  for (const metric of metrics) {
    upsertAggregateLihtcDifficultDevelopmentAreaMetric(metric);
  }

  return {
    fetched: features.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudDifficultDevelopmentAreasSource(
  input: HudDifficultDevelopmentAreasInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate LIHTC difficult development areas",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::difficult-development-areas-2026/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for LIHTC Difficult Development Areas. This adapter stores HUD FMR/MSA aggregate ZCTA counts only and does not request geometry, addresses, people, households, owners, or parcel records.",
  });
}

export function buildHudDifficultDevelopmentAreasUrl(
  input: Pick<HudDifficultDevelopmentAreasInput, "layerUrl" | "areas">,
  options: { offset?: number; pageSize?: number } = {},
) {
  const pageSize = clampPositiveInteger(options.pageSize, 2000, 2000);
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

export function aggregateHudDifficultDevelopmentAreas(
  features: ArcGisFeature[],
  input: Pick<
    HudDifficultDevelopmentAreasInput,
    "sourceId" | "hub" | "fiscalYear" | "areas"
  >,
): AggregateLihtcDifficultDevelopmentAreaMetricInput[] {
  const targetAreaLabels = new Map(
    input.areas.map((area) => [normalizeAreaName(area.name), area.label]),
  );
  const groups = new Map<string, AreaAccumulator>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const areaName = cleanText(attributes.DDA_NAME);
    const normalizedAreaName = normalizeAreaName(areaName);
    const label = targetAreaLabels.get(normalizedAreaName);
    if (!label) {
      continue;
    }

    for (const field of OUT_FIELDS) {
      if (!(field in attributes)) {
        throw new Error(
          `HUD difficult development areas response missing field: ${field}`,
        );
      }
    }

    const ddaCode = cleanText(attributes.DDA_CODE);
    const ddaType = cleanText(attributes.DDA_TYPE);
    const groupKey = `${normalizedAreaName}|${ddaCode}|${ddaType}`;
    const group =
      groups.get(groupKey) ??
      createAccumulator({
        areaName: label,
        ddaCode,
        ddaType,
      });

    const zcta = normalizeZcta(attributes.ZCTA5);
    if (zcta) {
      group.zctas.add(zcta);
    }
    groups.set(groupKey, group);
  }

  return Array.from(groups.values())
    .map((group) => {
      const zctas = Array.from(group.zctas).sort();
      return {
        sourceId: input.sourceId,
        sourceRecordId: `${input.fiscalYear}-${slugify(group.ddaCode || group.areaName)}`,
        hub: input.hub,
        fiscalYear: input.fiscalYear,
        areaName: group.areaName,
        ddaCode: group.ddaCode,
        ddaType: group.ddaType,
        zctaCount: zctas.length,
        raw: {
          zctas,
          fieldPolicy:
            "HUD DDA aggregate counts from ZCTA identifiers by HUD FMR/MSA label.",
        },
      };
    })
    .sort((left, right) => left.areaName.localeCompare(right.areaName));
}

function buildAreaWhereClause(areas: HudDifficultDevelopmentArea[]) {
  if (areas.length === 0) {
    throw new Error("HUD difficult development areas config needs areas.");
  }

  const quotedAreaNames = Array.from(
    new Set(areas.map((area) => cleanText(area.name)).filter(Boolean)),
  )
    .sort()
    .map((areaName) => `'${areaName.replace(/'/g, "''")}'`)
    .join(",");

  if (!quotedAreaNames) {
    throw new Error("HUD difficult development areas config needs area names.");
  }

  return `DDA_NAME IN (${quotedAreaNames})`;
}

async function parseArcGisJson(response: Response): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "HUD difficult development areas response was not valid JSON.",
    );
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD difficult development areas response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD difficult development areas features were malformed.");
  }

  return parsed;
}

function createAccumulator(input: {
  areaName: string;
  ddaCode: string;
  ddaType: string;
}): AreaAccumulator {
  return {
    ...input,
    zctas: new Set<string>(),
  };
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

function slugify(value: string) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
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

type AreaAccumulator = {
  areaName: string;
  ddaCode: string;
  ddaType: string;
  zctas: Set<string>;
};
