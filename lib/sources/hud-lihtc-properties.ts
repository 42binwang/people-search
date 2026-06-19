import {
  upsertAggregateLihtcPropertyInventoryMetric,
  upsertApprovedSource,
  type AggregateLihtcPropertyInventoryMetricInput,
} from "@/lib/db";

export type HudLihtcPropertiesCounty = {
  label: string;
  state: string;
  county: string;
};

export type HudLihtcPropertiesInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  coveragePeriod: string;
  counties: HudLihtcPropertiesCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudLihtcPropertiesIngestResult = {
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
  "N_UNITS",
  "LI_UNITS",
  "N_0BR",
  "N_1BR",
  "N_2BR",
  "N_3BR",
  "N_4BR",
  "ALLOCAMT",
  "YR_PIS",
  "YR_ALLOC",
] as const;

export async function ingestHudLihtcProperties(
  input: HudLihtcPropertiesInput,
): Promise<HudLihtcPropertiesIngestResult> {
  registerHudLihtcPropertiesSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 2000, 2000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  const features: ArcGisFeature[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudLihtcPropertiesUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchHudLihtcPropertiesIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD LIHTC properties request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const pageFeatures = payload.features ?? [];
    features.push(...pageFeatures);

    if (pageFeatures.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  const metrics = aggregateHudLihtcProperties(features, input);
  for (const metric of metrics) {
    upsertAggregateLihtcPropertyInventoryMetric(metric);
  }

  return {
    fetched: features.length,
    imported: metrics.length,
    urls,
  };
}

export function registerHudLihtcPropertiesSource(input: HudLihtcPropertiesInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate LIHTC property inventory",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::low-income-housing-tax-credit-properties/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for Low-Income Housing Tax Credit properties. This adapter stores county-level aggregate project and unit metrics only and does not request project names, addresses, contacts, companies, geometry, or latitude/longitude.",
  });
}

export function buildHudLihtcPropertiesUrl(
  input: Pick<HudLihtcPropertiesInput, "layerUrl" | "counties">,
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

export function aggregateHudLihtcProperties(
  features: ArcGisFeature[],
  input: Pick<
    HudLihtcPropertiesInput,
    "sourceId" | "hub" | "coveragePeriod" | "counties"
  >,
): AggregateLihtcPropertyInventoryMetricInput[] {
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
        throw new Error(`HUD LIHTC properties response missing field: ${field}`);
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

    group.projectCount += 1;
    addToIntegerSum(group.totalUnits, attributes.N_UNITS);
    addToIntegerSum(group.lowIncomeUnits, attributes.LI_UNITS);
    addToIntegerSum(group.zeroBedroomUnits, attributes.N_0BR);
    addToIntegerSum(group.oneBedroomUnits, attributes.N_1BR);
    addToIntegerSum(group.twoBedroomUnits, attributes.N_2BR);
    addToIntegerSum(group.threeBedroomUnits, attributes.N_3BR);
    addToIntegerSum(group.fourPlusBedroomUnits, attributes.N_4BR);
    addToNumberSum(group.allocationAmount, attributes.ALLOCAMT);
    addToYearRange(group.placedInServiceYears, attributes.YR_PIS);
    addToYearRange(group.allocationYears, attributes.YR_ALLOC);
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
      projectCount: group.projectCount,
      totalUnits: nullableSum(group.totalUnits),
      lowIncomeUnits: nullableSum(group.lowIncomeUnits),
      zeroBedroomUnits: nullableSum(group.zeroBedroomUnits),
      oneBedroomUnits: nullableSum(group.oneBedroomUnits),
      twoBedroomUnits: nullableSum(group.twoBedroomUnits),
      threeBedroomUnits: nullableSum(group.threeBedroomUnits),
      fourPlusBedroomUnits: nullableSum(group.fourPlusBedroomUnits),
      allocationAmount: nullableSum(group.allocationAmount),
      earliestPlacedInServiceYear: group.placedInServiceYears.min,
      latestPlacedInServiceYear: group.placedInServiceYears.max,
      earliestAllocationYear: group.allocationYears.min,
      latestAllocationYear: group.allocationYears.max,
      raw: {
        projectCount: group.projectCount,
        fieldPolicy: "County aggregates from selected HUD non-address fields.",
      },
    }))
    .sort((left, right) =>
      `${left.stateFips}${left.countyFips}`.localeCompare(
        `${right.stateFips}${right.countyFips}`,
      ),
    );
}

function buildCountyWhereClause(counties: HudLihtcPropertiesCounty[]) {
  if (counties.length === 0) {
    throw new Error("HUD LIHTC properties config needs counties.");
  }

  const countiesByState = new Map<string, string[]>();
  for (const county of counties) {
    const stateFips = unpadFips(county.state);
    const countyFips = unpadFips(county.county);
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
    throw new Error("HUD LIHTC properties response was not valid JSON.");
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD LIHTC properties response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD LIHTC properties features were malformed.");
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
    projectCount: 0,
    totalUnits: { sum: 0, count: 0 },
    lowIncomeUnits: { sum: 0, count: 0 },
    zeroBedroomUnits: { sum: 0, count: 0 },
    oneBedroomUnits: { sum: 0, count: 0 },
    twoBedroomUnits: { sum: 0, count: 0 },
    threeBedroomUnits: { sum: 0, count: 0 },
    fourPlusBedroomUnits: { sum: 0, count: 0 },
    allocationAmount: { sum: 0, count: 0 },
    placedInServiceYears: { min: null, max: null },
    allocationYears: { min: null, max: null },
  };
}

function addToIntegerSum(target: NumericAccumulator, value: unknown) {
  const parsed = parseOptionalInteger(value);
  if (parsed === null) {
    return;
  }
  target.sum += parsed;
  target.count += 1;
}

function addToNumberSum(target: NumericAccumulator, value: unknown) {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) {
    return;
  }
  target.sum += parsed;
  target.count += 1;
}

function addToYearRange(target: YearRange, value: unknown) {
  const parsed = parseOptionalYear(value);
  if (parsed === null) {
    return;
  }
  target.min = target.min === null ? parsed : Math.min(target.min, parsed);
  target.max = target.max === null ? parsed : Math.max(target.max, parsed);
}

function nullableSum(target: NumericAccumulator) {
  return target.count > 0 ? target.sum : null;
}

function parseOptionalInteger(value: unknown) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function parseOptionalNumber(value: unknown) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalYear(value: unknown) {
  const text = cleanText(value);
  if (!/^\d{4}$/.test(text)) {
    return null;
  }
  const parsed = Number(text);
  return parsed >= 1900 && parsed <= 2100 ? parsed : null;
}

function normalizeFips(value: string, length: number) {
  return value.replace(/\D/g, "").padStart(length, "0").slice(-length);
}

function unpadFips(value: string) {
  return String(Number(value.replace(/\D/g, "")));
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

type YearRange = {
  min: number | null;
  max: number | null;
};

type CountyAccumulator = {
  stateFips: string;
  countyFips: string;
  countyName: string;
  projectCount: number;
  totalUnits: NumericAccumulator;
  lowIncomeUnits: NumericAccumulator;
  zeroBedroomUnits: NumericAccumulator;
  oneBedroomUnits: NumericAccumulator;
  twoBedroomUnits: NumericAccumulator;
  threeBedroomUnits: NumericAccumulator;
  fourPlusBedroomUnits: NumericAccumulator;
  allocationAmount: NumericAccumulator;
  placedInServiceYears: YearRange;
  allocationYears: YearRange;
};
