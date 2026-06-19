import {
  upsertAggregatePublicHousingInventoryMetric,
  upsertApprovedSource,
  type AggregatePublicHousingInventoryMetricInput,
} from "@/lib/db";

export type HudPublicHousingBuildingsCounty = {
  label: string;
  state: string;
  county: string;
};

export type HudPublicHousingBuildingsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  coveragePeriod: string;
  counties: HudPublicHousingBuildingsCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudPublicHousingBuildingsIngestResult = {
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
  "STATE2KX",
  "CNTY2KX",
  "CNTY_NM2KX",
  "TOTAL_DWELLING_UNITS",
  "TOTAL_UNITS",
  "TOTAL_OCCUPIED",
  "REGULAR_VACANT",
  "NUMBER_REPORTED",
  "PEOPLE_TOTAL",
  "PCT_OCCUPIED",
] as const;

export async function ingestHudPublicHousingBuildings(
  input: HudPublicHousingBuildingsInput,
): Promise<HudPublicHousingBuildingsIngestResult> {
  registerHudPublicHousingBuildingsSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 1000, 1000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  const features: ArcGisFeature[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudPublicHousingBuildingsUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchHudPublicHousingBuildingsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD public housing buildings request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    features.push(...pageFeatures);

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  const metrics = aggregateHudPublicHousingBuildings(features, input);
  for (const metric of metrics) {
    upsertAggregatePublicHousingInventoryMetric(metric);
  }

  return {
    fetched: features.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudPublicHousingBuildingsSource(
  input: HudPublicHousingBuildingsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate public housing inventory",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::public-housing-buildings/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for public housing development buildings. This adapter stores county-level aggregate inventory metrics only and does not request addresses, contacts, geometry, or resident characteristic fields.",
  });
}

export function buildHudPublicHousingBuildingsUrl(
  input: Pick<HudPublicHousingBuildingsInput, "layerUrl" | "counties">,
  options: { offset?: number; pageSize?: number } = {},
) {
  const pageSize = clampPositiveInteger(options.pageSize, 1000, 1000);
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

export function aggregateHudPublicHousingBuildings(
  features: ArcGisFeature[],
  input: Pick<
    HudPublicHousingBuildingsInput,
    "sourceId" | "hub" | "coveragePeriod" | "counties"
  >,
): AggregatePublicHousingInventoryMetricInput[] {
  const targetCountyKeys = new Map(
    input.counties.map((county) => [
      `${normalizeFips(county.state, 2)}${normalizeFips(county.county, 3)}`,
      county.label,
    ]),
  );
  const groups = new Map<string, CountyAccumulator>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const stateFips = normalizeFips(String(attributes.STATE2KX ?? ""), 2);
    const countyFips = normalizeFips(String(attributes.CNTY2KX ?? ""), 3);
    const countyKey = `${stateFips}${countyFips}`;
    if (!targetCountyKeys.has(countyKey)) {
      continue;
    }

    for (const field of OUT_FIELDS) {
      if (!(field in attributes)) {
        throw new Error(
          `HUD public housing buildings response missing field: ${field}`,
        );
      }
    }

    const group =
      groups.get(countyKey) ??
      createAccumulator({
        stateFips,
        countyFips,
        countyName:
          cleanText(attributes.CNTY_NM2KX) || targetCountyKeys.get(countyKey)!,
      });
    group.buildingCount += 1;
    addToSum(group.totalDwellingUnits, attributes.TOTAL_DWELLING_UNITS);
    addToSum(group.totalUnits, attributes.TOTAL_UNITS);
    addToSum(group.occupiedUnits, attributes.TOTAL_OCCUPIED);
    addToSum(group.vacantUnits, attributes.REGULAR_VACANT);
    addToSum(group.numberReported, attributes.NUMBER_REPORTED);
    addToSum(group.peopleTotal, attributes.PEOPLE_TOTAL);
    addToAverage(group.pctOccupied, attributes.PCT_OCCUPIED);
    groups.set(countyKey, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      sourceId: input.sourceId,
      sourceRecordId: `${slugify(input.coveragePeriod)}-${group.stateFips}${group.countyFips}`,
      hub: input.hub,
      coveragePeriod: input.coveragePeriod,
      stateFips: group.stateFips,
      countyFips: group.countyFips,
      countyName: group.countyName,
      buildingCount: group.buildingCount,
      totalDwellingUnits: nullableSum(group.totalDwellingUnits),
      totalUnits: nullableSum(group.totalUnits),
      occupiedUnits: nullableSum(group.occupiedUnits),
      vacantUnits: nullableSum(group.vacantUnits),
      numberReported: nullableSum(group.numberReported),
      peopleTotal: nullableSum(group.peopleTotal),
      averagePctOccupied: nullableAverage(group.pctOccupied),
      raw: {
        buildingCount: group.buildingCount,
        fieldPolicy: "County aggregates from selected HUD non-address fields.",
      },
    }))
    .sort((left, right) =>
      `${left.stateFips}${left.countyFips}`.localeCompare(
        `${right.stateFips}${right.countyFips}`,
      ),
    );
}

function buildCountyWhereClause(counties: HudPublicHousingBuildingsCounty[]) {
  if (counties.length === 0) {
    throw new Error("HUD public housing buildings config needs counties.");
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
      return `(STATE2KX = '${stateFips}' AND CNTY2KX IN (${quotedCountyValues}))`;
    })
    .join(" OR ");
}

async function parseArcGisJson(response: Response): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("HUD public housing buildings response was not valid JSON.");
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD public housing buildings response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD public housing buildings features were malformed.");
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
    buildingCount: 0,
    totalDwellingUnits: { sum: 0, count: 0 },
    totalUnits: { sum: 0, count: 0 },
    occupiedUnits: { sum: 0, count: 0 },
    vacantUnits: { sum: 0, count: 0 },
    numberReported: { sum: 0, count: 0 },
    peopleTotal: { sum: 0, count: 0 },
    pctOccupied: { sum: 0, count: 0 },
  };
}

function addToSum(target: NumericAccumulator, value: unknown) {
  const parsed = parseOptionalInteger(value);
  if (parsed === null) {
    return;
  }
  target.sum += parsed;
  target.count += 1;
}

function addToAverage(target: NumericAccumulator, value: unknown) {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) {
    return;
  }
  target.sum += parsed;
  target.count += 1;
}

function nullableSum(target: NumericAccumulator) {
  return target.count > 0 ? target.sum : null;
}

function nullableAverage(target: NumericAccumulator) {
  return target.count > 0 ? target.sum / target.count : null;
}

function parseOptionalInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function parseOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

function slugify(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type NumericAccumulator = {
  sum: number;
  count: number;
};

type CountyAccumulator = {
  stateFips: string;
  countyFips: string;
  countyName: string;
  buildingCount: number;
  totalDwellingUnits: NumericAccumulator;
  totalUnits: NumericAccumulator;
  occupiedUnits: NumericAccumulator;
  vacantUnits: NumericAccumulator;
  numberReported: NumericAccumulator;
  peopleTotal: NumericAccumulator;
  pctOccupied: NumericAccumulator;
};
