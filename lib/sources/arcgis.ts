import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type ArcGisFieldMap = {
  recordId: string;
  name: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  updatedAt?: string;
};

export type ArcGisIngestInput = {
  sourceId: string;
  sourceName: string;
  jurisdiction: string;
  layerUrl: string;
  fields: ArcGisFieldMap;
  category?: string;
  licenseUrl?: string;
  notes?: string;
  query?: string;
  where?: string;
  limit?: number;
};

export type ArcGisIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestArcGisFeatureLayer(
  input: ArcGisIngestInput,
): Promise<ArcGisIngestResult> {
  registerArcGisSource(input);

  const limit = clampLimit(input.limit, 5000);
  const url = buildArcGisQueryUrl(input, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchArcGisIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `ArcGIS request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as ArcGisResponse;
  if (payload.error) {
    throw new Error(`ArcGIS request failed: ${payload.error.message}`);
  }

  const features = applyImportLimit(payload.features ?? [], limit);
  let imported = 0;

  for (const feature of features) {
    const profile = mapArcGisFeatureToProfileInput(feature, input);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: features.length,
    imported,
    url,
  };
}

export function registerArcGisSource(input: ArcGisIngestInput) {
  upsertApprovedSource({
    id: input.sourceId,
    name: input.sourceName,
    category: input.category ?? "Property and parcel open data",
    jurisdiction: input.jurisdiction,
    acquisitionMethod: "official_api",
    licenseUrl: input.licenseUrl ?? input.layerUrl,
    notes:
      input.notes ??
      "Official ArcGIS FeatureServer query endpoint. Use only after confirming this layer allows commercial reuse and public republication.",
  });
}

export function mapArcGisFeatureToProfileInput(
  feature: ArcGisFeature,
  input: Pick<ArcGisIngestInput, "sourceId" | "fields">,
): UpsertProfileInput | null {
  const attributes = feature.attributes ?? {};
  const fields = input.fields;
  const fullName = clean(attributes[fields.name]);
  const city = clean(attributes[fields.city]);
  const state = clean(attributes[fields.state]).toUpperCase();
  const recordId = clean(attributes[fields.recordId]);

  if (!fullName || !city || !state || !recordId) {
    return null;
  }

  return {
    id: `p_${slugify(input.sourceId)}_${slugify(recordId)}`,
    fullName: titleCaseName(fullName),
    ageRange: "Unknown",
    confidence: "Medium",
    aliases: [
      fields.updatedAt && clean(attributes[fields.updatedAt])
        ? `Source updated: ${clean(attributes[fields.updatedAt])}`
        : "",
    ].filter(Boolean),
    locations: [
      {
        street: fields.street ? clean(attributes[fields.street]) : undefined,
        city: titleCaseName(city),
        state,
        zip: fields.zip ? clean(attributes[fields.zip]) : undefined,
        kind: "public property record",
        sourceId: input.sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId: input.sourceId,
      sourceRecordId: recordId,
      raw: feature,
    },
  };
}

function buildArcGisQueryUrl(input: ArcGisIngestInput, limit: number | undefined) {
  const url = new URL(`${input.layerUrl.replace(/\/+$/, "")}/query`);
  const outFields = unique([
    input.fields.recordId,
    input.fields.name,
    input.fields.street,
    input.fields.city,
    input.fields.state,
    input.fields.zip,
    input.fields.updatedAt,
  ]);

  url.searchParams.set("f", "json");
  url.searchParams.set("where", buildWhere(input));
  url.searchParams.set("outFields", outFields.join(","));
  url.searchParams.set("returnGeometry", "false");
  if (limit) {
    url.searchParams.set("resultRecordCount", String(limit));
  }

  return url.toString();
}

function buildWhere(input: ArcGisIngestInput) {
  if (input.where) {
    return input.where;
  }

  if (input.query) {
    return `UPPER(${input.fields.name}) LIKE '%${escapeArcGisLike(input.query.toUpperCase())}%'`;
  }

  return "1=1";
}

function escapeArcGisLike(value: string) {
  return value.replace(/'/g, "''").replace(/[%_]/g, "");
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bLlc\b/g, "LLC")
    .replace(/\bInc\b/g, "Inc")
    .trim();
}

function slugify(value: string) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "_") || "unknown";
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

export type ArcGisFeature = {
  attributes?: Record<string, unknown>;
};

type ArcGisResponse = {
  features?: ArcGisFeature[];
  error?: {
    message: string;
  };
};
