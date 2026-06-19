import {
  upsertAggregateLihtcQualifiedCensusTractMetric,
  upsertApprovedSource,
  type AggregateLihtcQualifiedCensusTractMetricInput,
} from "@/lib/db";

export type HudQualifiedCensusTractCounty = {
  label: string;
  state: string;
  county: string;
};

export type HudQualifiedCensusTractsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  fiscalYear: number;
  counties: HudQualifiedCensusTractCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudQualifiedCensusTractsIngestResult = {
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

const OUT_FIELDS = ["GEOID", "STATE", "COUNTY", "TRACT", "NAME"] as const;

export async function ingestHudQualifiedCensusTracts(
  input: HudQualifiedCensusTractsInput,
): Promise<HudQualifiedCensusTractsIngestResult> {
  registerHudQualifiedCensusTractsSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 2000, 2000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  const features: ArcGisFeature[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudQualifiedCensusTractsUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchHudQualifiedCensusTractsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD qualified census tracts request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    features.push(...pageFeatures);

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  const metrics = aggregateHudQualifiedCensusTracts(features, input);
  for (const metric of metrics) {
    upsertAggregateLihtcQualifiedCensusTractMetric(metric);
  }

  return {
    fetched: features.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudQualifiedCensusTractsSource(
  input: HudQualifiedCensusTractsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate LIHTC qualified census tracts",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for LIHTC Qualified Census Tracts. This adapter stores county-level counts of qualifying tracts only and does not request geometry or address fields.",
  });
}

export function buildHudQualifiedCensusTractsUrl(
  input: Pick<HudQualifiedCensusTractsInput, "layerUrl" | "counties">,
  options: { offset?: number; pageSize?: number } = {},
) {
  const pageSize = clampPositiveInteger(options.pageSize, 2000, 2000);
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const url = new URL(`${input.layerUrl.replace(/\/+$/, "")}/query`);

  url.searchParams.set("f", "json");
  url.searchParams.set("where", buildCountyWhereClause(input.counties));
  url.searchParams.set("outFields", OUT_FIELDS.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultOffset", String(offset));
  url.searchParams.set("resultRecordCount", String(pageSize));

  return url.toString();
}

export function aggregateHudQualifiedCensusTracts(
  features: ArcGisFeature[],
  input: Pick<
    HudQualifiedCensusTractsInput,
    "sourceId" | "hub" | "fiscalYear" | "counties"
  >,
): AggregateLihtcQualifiedCensusTractMetricInput[] {
  const targetCountyKeys = new Map(
    input.counties.map((county) => [
      `${normalizeFips(county.state, 2)}${normalizeFips(county.county, 3)}`,
      county.label,
    ]),
  );
  const groups = new Map<string, CountyAccumulator>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const stateFips = normalizeFips(String(attributes.STATE ?? ""), 2);
    const countyFips = normalizeFips(String(attributes.COUNTY ?? ""), 3);
    const countyKey = `${stateFips}${countyFips}`;
    if (!targetCountyKeys.has(countyKey)) {
      continue;
    }

    for (const field of OUT_FIELDS) {
      if (!(field in attributes)) {
        throw new Error(
          `HUD qualified census tracts response missing field: ${field}`,
        );
      }
    }

    const group =
      groups.get(countyKey) ??
      createAccumulator({
        stateFips,
        countyFips,
        countyName: targetCountyKeys.get(countyKey)!,
      });

    group.qualifiedTractCount += 1;
    const geoid = cleanText(attributes.GEOID);
    if (geoid) {
      group.tractGeoids.push(geoid);
    }
    groups.set(countyKey, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      sourceId: input.sourceId,
      sourceRecordId: `${input.fiscalYear}-${group.stateFips}${group.countyFips}`,
      hub: input.hub,
      fiscalYear: input.fiscalYear,
      stateFips: group.stateFips,
      countyFips: group.countyFips,
      countyName: group.countyName,
      qualifiedTractCount: group.qualifiedTractCount,
      raw: {
        tractGeoids: group.tractGeoids.sort(),
        fieldPolicy: "County aggregate counts from HUD QCT tract identifiers.",
      },
    }))
    .sort((left, right) =>
      `${left.stateFips}${left.countyFips}`.localeCompare(
        `${right.stateFips}${right.countyFips}`,
      ),
    );
}

function buildCountyWhereClause(counties: HudQualifiedCensusTractCounty[]) {
  if (counties.length === 0) {
    throw new Error("HUD qualified census tracts config needs counties.");
  }

  const countiesByState = new Map<string, string[]>();
  for (const county of counties) {
    const stateFips = normalizeFips(county.state, 2);
    const countyFips = normalizeFips(county.county, 3);
    countiesByState.set(stateFips, [
      ...(countiesByState.get(stateFips) ?? []),
      countyFips,
    ]);
  }

  return Array.from(countiesByState.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stateFips, countyFipsValues]) => {
      const quotedCountyValues = Array.from(new Set(countyFipsValues))
        .sort()
        .map((countyFips) => `'${countyFips}'`)
        .join(",");
      return `(STATE = '${stateFips}' AND COUNTY IN (${quotedCountyValues}))`;
    })
    .join(" OR ");
}

async function parseArcGisJson(response: Response): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("HUD qualified census tracts response was not valid JSON.");
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD qualified census tracts response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD qualified census tracts features were malformed.");
  }

  return parsed;
}

function createAccumulator(input: {
  stateFips: string;
  countyFips: string;
  countyName: string;
}): CountyAccumulator {
  return {
    ...input,
    qualifiedTractCount: 0,
    tractGeoids: [],
  };
}

function normalizeFips(value: string, length: number) {
  return value.replace(/\D/g, "").padStart(length, "0").slice(-length);
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
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

type CountyAccumulator = {
  stateFips: string;
  countyFips: string;
  countyName: string;
  qualifiedTractCount: number;
  tractGeoids: string[];
};
