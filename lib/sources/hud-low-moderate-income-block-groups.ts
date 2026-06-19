import {
  upsertAggregateLowModerateIncomeMetric,
  upsertApprovedSource,
  type AggregateLowModerateIncomeMetricInput,
} from "@/lib/db";

export type HudLowModerateIncomeCounty = {
  label: string;
  state: string;
  county: string;
};

export type HudLowModerateIncomeBlockGroupsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  coveragePeriod: string;
  counties: HudLowModerateIncomeCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudLowModerateIncomeBlockGroupsIngestResult = {
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
  "GEOID",
  "Source",
  "geoname",
  "Stusab",
  "Countyname",
  "State",
  "County",
  "Tract",
  "BLKGRP",
  "Low",
  "Lowmod",
  "Lmmi",
  "Lowmoduniv",
  "Lowmod_pct",
  "uclow",
  "uclowmod",
  "ucLowmod_p",
  "MOE_LOWMOD_PCT",
  "MOE_UCLOWMOD_PCT",
] as const;

export async function ingestHudLowModerateIncomeBlockGroups(
  input: HudLowModerateIncomeBlockGroupsInput,
): Promise<HudLowModerateIncomeBlockGroupsIngestResult> {
  registerHudLowModerateIncomeBlockGroupsSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 2000, 2000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  const features: ArcGisFeature[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudLowModerateIncomeBlockGroupsUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchHudLowModerateIncomeBlockGroupsIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD low/moderate income block groups request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    features.push(...pageFeatures);

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  const metrics = aggregateHudLowModerateIncomeBlockGroups(features, input);
  for (const metric of metrics) {
    upsertAggregateLowModerateIncomeMetric(metric);
  }

  return {
    fetched: features.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudLowModerateIncomeBlockGroupsSource(
  input: HudLowModerateIncomeBlockGroupsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate low/moderate income population",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::low-to-moderate-income-population-by-block-group/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for Low/Moderate Income Populations by block group. This adapter stores county-level aggregate counts only and does not request geometry, addresses, names, households, contacts, property owners, tenants, or parcel records.",
  });
}

export function buildHudLowModerateIncomeBlockGroupsUrl(
  input: Pick<HudLowModerateIncomeBlockGroupsInput, "layerUrl" | "counties">,
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

export function aggregateHudLowModerateIncomeBlockGroups(
  features: ArcGisFeature[],
  input: Pick<
    HudLowModerateIncomeBlockGroupsInput,
    "sourceId" | "hub" | "coveragePeriod" | "counties"
  >,
): AggregateLowModerateIncomeMetricInput[] {
  const targetCountyKeys = new Map(
    input.counties.map((county) => [
      `${normalizeFips(county.state, 2)}${normalizeFips(county.county, 3)}`,
      county.label,
    ]),
  );
  const groups = new Map<string, CountyAccumulator>();

  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    const stateFips = normalizeFips(String(attributes.State ?? ""), 2);
    const countyFips = normalizeFips(String(attributes.County ?? ""), 3);
    const countyKey = `${stateFips}${countyFips}`;
    if (!targetCountyKeys.has(countyKey)) {
      continue;
    }

    for (const field of OUT_FIELDS) {
      if (!(field in attributes)) {
        throw new Error(
          `HUD low/moderate income block groups response missing field: ${field}`,
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

    const lowPersons = parseInteger(attributes.Low);
    const lowModPersons = parseInteger(attributes.Lowmod);
    const lowModerateMiddleIncomePersons = parseInteger(attributes.Lmmi);
    const lowModUniverse = parseInteger(attributes.Lowmoduniv);
    const lowModPct = parseNumber(attributes.Lowmod_pct);
    const geoid = cleanText(attributes.GEOID);
    const source = cleanText(attributes.Source);

    group.blockGroupCount += 1;
    group.lowPersons = sumNullable(group.lowPersons, lowPersons);
    group.lowModPersons = sumNullable(group.lowModPersons, lowModPersons);
    group.lowModerateMiddleIncomePersons = sumNullable(
      group.lowModerateMiddleIncomePersons,
      lowModerateMiddleIncomePersons,
    );
    group.lowModUniverse = sumNullable(group.lowModUniverse, lowModUniverse);
    if (lowModPct !== null && lowModPct >= 0.51) {
      group.blockGroups51PctPlus += 1;
    }
    if (geoid) {
      group.blockGroupGeoids.push(geoid);
    }
    if (source) {
      group.sources.add(source);
    }

    groups.set(countyKey, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      sourceId: input.sourceId,
      sourceRecordId: `${input.coveragePeriod}-${group.stateFips}${group.countyFips}`,
      hub: input.hub,
      coveragePeriod: input.coveragePeriod,
      stateFips: group.stateFips,
      countyFips: group.countyFips,
      countyName: group.countyName,
      blockGroupCount: group.blockGroupCount,
      lowPersons: group.lowPersons,
      lowModPersons: group.lowModPersons,
      lowModerateMiddleIncomePersons:
        group.lowModerateMiddleIncomePersons,
      lowModUniverse: group.lowModUniverse,
      lowModPct:
        group.lowModPersons !== null &&
        group.lowModUniverse !== null &&
        group.lowModUniverse > 0
          ? group.lowModPersons / group.lowModUniverse
          : null,
      blockGroups51PctPlus: group.blockGroups51PctPlus,
      raw: {
        sourceValues: Array.from(group.sources).sort(),
        blockGroupGeoids: group.blockGroupGeoids.sort(),
        fieldPolicy:
          "County aggregate rollups from HUD low/moderate income block-group counts; geometry and personal/address fields are not requested.",
      },
    }))
    .sort((left, right) =>
      `${left.stateFips}${left.countyFips}`.localeCompare(
        `${right.stateFips}${right.countyFips}`,
      ),
    );
}

function buildCountyWhereClause(counties: HudLowModerateIncomeCounty[]) {
  if (counties.length === 0) {
    throw new Error("HUD low/moderate income config needs counties.");
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
      return `(State = '${stateFips}' AND County IN (${quotedCountyValues}))`;
    })
    .join(" OR ");
}

async function parseArcGisJson(response: Response): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "HUD low/moderate income block groups response was not valid JSON.",
    );
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(
      "HUD low/moderate income block groups response was malformed.",
    );
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error(
      "HUD low/moderate income block groups features were malformed.",
    );
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
    blockGroupCount: 0,
    lowPersons: null,
    lowModPersons: null,
    lowModerateMiddleIncomePersons: null,
    lowModUniverse: null,
    blockGroups51PctPlus: 0,
    blockGroupGeoids: [],
    sources: new Set<string>(),
  };
}

function sumNullable(current: number | null, value: number | null) {
  if (value === null) {
    return current;
  }
  return (current ?? 0) + value;
}

function parseInteger(value: unknown) {
  const text = cleanText(value).replace(/,/g, "");
  if (!text || text === "-") {
    return null;
  }
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = cleanText(value).replace(/,/g, "");
  if (!text || text === "-") {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
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
  blockGroupCount: number;
  lowPersons: number | null;
  lowModPersons: number | null;
  lowModerateMiddleIncomePersons: number | null;
  lowModUniverse: number | null;
  blockGroups51PctPlus: number;
  blockGroupGeoids: string[];
  sources: Set<string>;
};
