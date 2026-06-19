import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type WikidataIngestInput = {
  query: string;
  limit?: number;
};

export type WikidataIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "wikidata_entities";

export async function ingestWikidataEntities(
  input: WikidataIngestInput,
): Promise<WikidataIngestResult> {
  registerWikidataSource();

  const limit = clampLimit(input.limit, 50);
  const url = buildWikidataSearchUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchWikidataIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Wikidata request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as WikidataSearchResponse;
  const results = applyImportLimit(payload.search ?? [], limit);
  let imported = 0;

  for (const entity of results) {
    const profile = mapWikidataEntityToProfileInput(entity);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: results.length,
    imported,
    url,
  };
}

export function registerWikidataSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Wikidata Entity Search API",
    category: "Public knowledge entity",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access",
    notes:
      "Official Wikidata/MediaWiki API. Use as public-knowledge context only; entity search hits are not contact or residential evidence.",
  });
}

export function mapWikidataEntityToProfileInput(
  entity: WikidataSearchEntity,
): UpsertProfileInput | null {
  if (!entity.id || !entity.label) {
    return null;
  }

  const description = stripHtml(entity.description || "");
  const conceptUri = entity.concepturi || entity.url;

  return {
    id: `p_wikidata_${entity.id}`,
    fullName: entity.label,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      description ? `Description: ${description}` : "",
      conceptUri ? `Wikidata entity: ${conceptUri}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: "Wikidata",
        state: "Global",
        kind: "public knowledge entity",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: entity.id,
      raw: entity,
    },
  };
}

function buildWikidataSearchUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("type", "item");
  url.searchParams.set("search", input.query);
  if (input.limit) {
    url.searchParams.set("limit", String(input.limit));
  }
  url.searchParams.set("origin", "*");
  return url.toString();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

type WikidataSearchResponse = {
  search?: WikidataSearchEntity[];
};

export type WikidataSearchEntity = {
  id: string;
  label: string;
  description?: string;
  concepturi?: string;
  url?: string;
};
