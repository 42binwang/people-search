import {
  upsertAggregateResidentialConstructionPermitMetric,
  upsertApprovedSource,
  type AggregateResidentialConstructionPermitMetricInput,
} from "@/lib/db";

export type HudResidentialConstructionPermitsCounty = {
  label: string;
  state: string;
  county: string;
};

export type HudResidentialConstructionPermitsInput = {
  sourceId: string;
  sourceName: string;
  hub: string;
  layerUrl: string;
  years: number[];
  counties: HudResidentialConstructionPermitsCounty[];
  category?: string;
  jurisdiction?: string;
  licenseUrl?: string;
  notes?: string;
};

export type HudResidentialConstructionPermitsIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
};

type ArcGisQueryPayload = {
  features?: ArcGisFeature[];
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

const REQUIRED_BASE_FIELDS = [
  "GEOID",
  "STATE",
  "COUNTY",
  "NAME",
  "STATE_NAME",
] as const;

export async function ingestHudResidentialConstructionPermits(
  input: HudResidentialConstructionPermitsInput,
): Promise<HudResidentialConstructionPermitsIngestResult> {
  registerHudResidentialConstructionPermitsSource(input);

  const url = buildHudResidentialConstructionPermitsUrl(input);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "PeopleSearchHudResidentialConstructionPermitsIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `HUD residential construction permits request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = await parseArcGisJson(response);
  const metrics = parseHudResidentialConstructionPermitsResponse(
    payload,
    input,
  );

  for (const metric of metrics) {
    upsertAggregateResidentialConstructionPermitMetric(metric);
  }

  return {
    fetched: payload.features?.length ?? 0,
    imported: metrics.length,
    url,
  };
}

export function registerHudResidentialConstructionPermitsSource(
  input: HudResidentialConstructionPermitsInput,
) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category:
      input.category ?? "Aggregate residential construction permit activity",
    jurisdiction: input.jurisdiction ?? input.hub,
    acquisitionMethod: "official_api",
    licenseUrl:
      input.licenseUrl ??
      "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::residential-construction-permits-by-county/about",
    notes:
      input.notes ??
      "HUD open-data ArcGIS layer derived from Census Building Permits Survey county annual residential construction permit totals. This source stores aggregate county-year counts only and must not be used as individual residence evidence.",
  });
}

export function buildHudResidentialConstructionPermitsUrl(
  input: Pick<
    HudResidentialConstructionPermitsInput,
    "layerUrl" | "years" | "counties"
  >,
) {
  const url = new URL(`${input.layerUrl.replace(/\/+$/, "")}/query`);
  url.searchParams.set("f", "json");
  url.searchParams.set("where", buildCountyWhereClause(input.counties));
  url.searchParams.set("outFields", buildOutFields(input.years).join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", String(input.counties.length));
  return url.toString();
}

export function parseHudResidentialConstructionPermitsResponse(
  payload: unknown,
  input: Pick<
    HudResidentialConstructionPermitsInput,
    "sourceId" | "hub" | "years" | "counties"
  >,
): AggregateResidentialConstructionPermitMetricInput[] {
  const parsed = asArcGisQueryPayload(payload);
  const features = parsed.features ?? [];
  const targetCountyKeys = new Set(
    input.counties.map(
      (county) =>
        `${normalizeFips(county.state, 2)}${normalizeFips(county.county, 3)}`,
    ),
  );

  return features
    .filter((feature) => {
      const attributes = feature.attributes ?? {};
      const stateFips = normalizeFips(String(attributes.STATE ?? ""), 2);
      const countyFips = normalizeFips(String(attributes.COUNTY ?? ""), 3);
      return targetCountyKeys.has(`${stateFips}${countyFips}`);
    })
    .flatMap((feature) =>
      input.years.map((year) =>
        mapHudResidentialConstructionPermitsFeature(feature, input, year),
      ),
    )
    .sort((left, right) =>
      `${left.year}-${left.stateFips}${left.countyFips}`.localeCompare(
        `${right.year}-${right.stateFips}${right.countyFips}`,
      ),
    );
}

export function mapHudResidentialConstructionPermitsFeature(
  feature: ArcGisFeature,
  input: Pick<HudResidentialConstructionPermitsInput, "sourceId" | "hub">,
  year: number,
): AggregateResidentialConstructionPermitMetricInput {
  const attributes = feature.attributes ?? {};
  for (const field of [
    ...REQUIRED_BASE_FIELDS,
    allPermitsField(year),
    singleFamilyPermitsField(year),
    multifamilyPermitsField(year),
  ]) {
    if (!(field in attributes)) {
      throw new Error(
        `HUD residential construction permits response missing field: ${field}`,
      );
    }
  }

  const stateFips = normalizeFips(String(attributes.STATE ?? ""), 2);
  const countyFips = normalizeFips(String(attributes.COUNTY ?? ""), 3);
  const geoid = String(attributes.GEOID ?? `${stateFips}${countyFips}`);

  return {
    sourceId: input.sourceId,
    sourceRecordId: `${year}-${geoid}`,
    hub: input.hub,
    year,
    stateFips,
    countyFips,
    countyName: cleanText(attributes.NAME) || geoid,
    stateName: cleanText(attributes.STATE_NAME) || stateFips,
    allPermits: parseOptionalInteger(attributes[allPermitsField(year)]),
    singleFamilyPermits: parseOptionalInteger(
      attributes[singleFamilyPermitsField(year)],
    ),
    multifamilyPermits: parseOptionalInteger(
      attributes[multifamilyPermitsField(year)],
    ),
    raw: attributes,
  };
}

function buildCountyWhereClause(
  counties: HudResidentialConstructionPermitsCounty[],
) {
  if (counties.length === 0) {
    throw new Error("HUD residential construction permits config needs counties.");
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

function buildOutFields(years: number[]) {
  if (years.length === 0) {
    throw new Error("HUD residential construction permits config needs years.");
  }

  return [
    ...REQUIRED_BASE_FIELDS,
    ...years.flatMap((year) => [
      allPermitsField(year),
      singleFamilyPermitsField(year),
      multifamilyPermitsField(year),
    ]),
  ];
}

async function parseArcGisJson(
  response: Response,
): Promise<ArcGisQueryPayload> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "HUD residential construction permits response was not valid JSON.",
    );
  }

  return asArcGisQueryPayload(parsed);
}

function asArcGisQueryPayload(payload: unknown): ArcGisQueryPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error(
      "HUD residential construction permits response was not an object.",
    );
  }

  const parsed = payload as ArcGisQueryPayload;
  if (parsed.error) {
    throw new Error(
      `HUD residential construction permits ArcGIS error: ${
        parsed.error.message ?? parsed.error.code ?? "unknown error"
      }`,
    );
  }

  if (!Array.isArray(parsed.features)) {
    throw new Error(
      "HUD residential construction permits response did not include features.",
    );
  }

  return parsed;
}

function allPermitsField(year: number) {
  return `ALL_PERMITS_${year}`;
}

function singleFamilyPermitsField(year: number) {
  return `SINGLE_FAMILY_PERMITS_${year}`;
}

function multifamilyPermitsField(year: number) {
  return `ALL_MULTIFAMILY_PERMITS_${year}`;
}

function normalizeFips(value: string, width: number) {
  return value.replace(/\D/g, "").padStart(width, "0").slice(-width);
}

function parseOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "-") {
    return null;
  }
  const numeric =
    typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
