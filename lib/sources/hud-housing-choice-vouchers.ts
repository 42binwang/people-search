import {
  upsertAggregateHousingAssistanceMetric,
  upsertApprovedSource,
  type AggregateHousingAssistanceMetricInput,
} from "@/lib/db";

export type HudHousingChoiceVoucherCounty = {
  label: string;
  state: string;
  county: string;
};

export type HudHousingChoiceVouchersInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  coveragePeriod: string;
  counties: HudHousingChoiceVoucherCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
  pageSize?: number;
  maxPages?: number;
};

export type HudHousingChoiceVouchersIngestResult = {
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
  "STATE",
  "COUNTY",
  "TRACT",
  "EANAME",
  "HCV_PUBLIC",
  "HCV_PUBLIC_PCT",
] as const;

export async function ingestHudHousingChoiceVouchers(
  input: HudHousingChoiceVouchersInput,
): Promise<HudHousingChoiceVouchersIngestResult> {
  registerHudHousingChoiceVouchersSource(input);

  const pageSize = clampPositiveInteger(input.pageSize, 2000, 2000);
  const maxPages = clampPositiveInteger(input.maxPages, 20, 100);
  const urls: string[] = [];
  let fetched = 0;
  let imported = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const url = buildHudHousingChoiceVouchersUrl(input, {
      offset: page * pageSize,
      pageSize,
    });
    urls.push(url);

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent":
          "PeopleSearchHudHousingChoiceVouchersIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HUD housing choice vouchers request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await parseArcGisJson(response);
    const features = payload.features ?? [];
    fetched += features.length;

    const metrics = parseHudHousingChoiceVouchersResponse(payload, input);
    for (const metric of metrics) {
      upsertAggregateHousingAssistanceMetric(metric);
      imported += 1;
    }

    if (features.length < pageSize && !payload.exceededTransferLimit) {
      break;
    }
  }

  return { fetched, imported, urls };
}

export function registerHudHousingChoiceVouchersSource(
  input: HudHousingChoiceVouchersInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Aggregate housing assistance",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::housing-choice-vouchers-by-tract/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer for Housing Choice Voucher counts aggregated to Census tracts. Public data omits tracts with 10 or fewer voucher holders and does not contain tenant identities or exact participant addresses.",
  });
}

export function buildHudHousingChoiceVouchersUrl(
  input: Pick<HudHousingChoiceVouchersInput, "layerUrl" | "counties">,
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

export function parseHudHousingChoiceVouchersResponse(
  payload: unknown,
  input: Pick<
    HudHousingChoiceVouchersInput,
    "sourceId" | "hub" | "coveragePeriod" | "counties"
  >,
): AggregateHousingAssistanceMetricInput[] {
  const parsed = asArcGisQueryPayload(payload);
  const targetCountyKeys = new Set(
    input.counties.map(
      (county) =>
        `${normalizeFips(county.state, 2)}${normalizeFips(county.county, 3)}`,
    ),
  );

  return (parsed.features ?? [])
    .filter((feature) => {
      const attributes = feature.attributes ?? {};
      const stateFips = normalizeFips(String(attributes.STATE ?? ""), 2);
      const countyFips = normalizeFips(String(attributes.COUNTY ?? ""), 3);
      return targetCountyKeys.has(`${stateFips}${countyFips}`);
    })
    .map((feature) => mapHudHousingChoiceVoucherFeature(feature, input))
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
}

export function mapHudHousingChoiceVoucherFeature(
  feature: ArcGisFeature,
  input: Pick<
    HudHousingChoiceVouchersInput,
    "sourceId" | "hub" | "coveragePeriod"
  >,
): AggregateHousingAssistanceMetricInput {
  const attributes = feature.attributes ?? {};
  for (const field of OUT_FIELDS) {
    if (!(field in attributes)) {
      throw new Error(
        `HUD housing choice vouchers response missing field: ${field}`,
      );
    }
  }

  const stateFips = normalizeFips(String(attributes.STATE ?? ""), 2);
  const countyFips = normalizeFips(String(attributes.COUNTY ?? ""), 3);
  const tractFips = normalizeFips(String(attributes.TRACT ?? ""), 6);
  const geoid = cleanText(attributes.GEOID) || `${stateFips}${countyFips}${tractFips}`;

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${slugify(input.coveragePeriod)}-${geoid}`,
    hub: input.hub,
    coveragePeriod: input.coveragePeriod,
    stateFips,
    countyFips,
    tractFips,
    geoid,
    geographyName: cleanText(attributes.EANAME) || geoid,
    housingChoiceVouchers: parseOptionalInteger(attributes.HCV_PUBLIC),
    housingChoiceVoucherPct: parseOptionalNumber(attributes.HCV_PUBLIC_PCT),
    raw: attributes,
  };
}

function buildCountyWhereClause(counties: HudHousingChoiceVoucherCounty[]) {
  if (counties.length === 0) {
    throw new Error("HUD housing choice vouchers config needs counties.");
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
    throw new Error("HUD housing choice vouchers response was not valid JSON.");
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("HUD housing choice vouchers response was malformed.");
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `ArcGIS error: ${parsed.error.message ?? parsed.error.code ?? "unknown"}`,
    );
  }

  if (parsed.features && !Array.isArray(parsed.features)) {
    throw new Error("HUD housing choice vouchers features were malformed.");
  }

  return parsed;
}

function normalizeFips(value: string, length: number) {
  return value.replace(/\D/g, "").padStart(length, "0").slice(-length);
}

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOptionalInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
