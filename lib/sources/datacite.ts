import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type DataCiteIngestInput = {
  query: string;
  limit?: number;
};

export type DataCiteIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "datacite_dois";

export async function ingestDataCiteCreators(
  input: DataCiteIngestInput,
): Promise<DataCiteIngestResult> {
  registerDataCiteSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildDataCiteUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.api+json, application/json",
      "user-agent": "PeopleSearchDataCiteIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `DataCite request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as DataCiteResponse;
  const works = applyImportLimit(payload.data ?? [], limit);
  let imported = 0;

  for (const work of works) {
    const profiles = mapDataCiteDoiToProfileInputs(input.query, work);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: works.length,
    imported,
    url,
  };
}

export function registerDataCiteSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "DataCite DOI REST API",
    category: "Research output creator mention",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://support.datacite.org/docs/api",
    notes:
      "Official DataCite REST API. Use as research output creator context only; not residential or contact evidence.",
  });
}

export function mapDataCiteDoiToProfileInputs(
  query: string,
  doi: DataCiteDoi,
): UpsertProfileInput[] {
  const attributes = doi.attributes;
  if (!attributes?.doi || !attributes.creators?.length) {
    return [];
  }

  const doiValue = attributes.doi;
  const title = attributes.titles?.[0]?.title ?? "Untitled DataCite record";
  const publisher = attributes.publisher;
  const year = attributes.publicationYear;
  const queryNorm = normalizeName(query);

  return attributes.creators
    .map((creator, index) => ({ creator, index }))
    .filter(({ creator }) => creatorNameMatchesQuery(creator, queryNorm))
    .map(({ creator, index }) => {
      const fullName = formatCreatorName(creator);
      const affiliations = (creator.affiliation ?? [])
        .map((affiliation) =>
          typeof affiliation === "string" ? affiliation : affiliation.name,
        )
        .filter((name): name is string => Boolean(name));

      return {
        id: `p_datacite_${slugify(fullName)}_${hashStable(doiValue)}_${index}`,
        fullName,
        ageRange: "Unknown",
        confidence: "Low",
        aliases: [
          `Research output: ${title}`,
          `DOI: ${doiValue}`,
          publisher ? `Publisher: ${publisher}` : "",
          year ? `Published: ${year}` : "",
        ].filter(Boolean),
        locations: affiliations.length
          ? affiliations.map((affiliation) => ({
              city: affiliation,
              state: "Global",
              kind: "research affiliation",
              sourceId,
            }))
          : [
              {
                city: "DataCite",
                state: "Global",
                kind: "research output creator mention",
                sourceId,
              },
            ],
        contacts: [],
        relationships: [],
        sourceRecord: {
          sourceId,
          sourceRecordId: `${doiValue}:${index}`,
          raw: {
            doi,
            matchedCreator: creator,
          },
        },
      };
    });
}

function buildDataCiteUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://api.datacite.org/dois");
  url.searchParams.set("query", input.query);
  if (input.limit) {
    url.searchParams.set("page[size]", String(input.limit));
  }
  url.searchParams.set("affiliation", "true");
  return url.toString();
}

function creatorNameMatchesQuery(creator: DataCiteCreator, queryNorm: string) {
  const creatorNorm = normalizeName(formatCreatorName(creator));
  const tokens = queryNorm.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => creatorNorm.includes(token));
}

function formatCreatorName(creator: DataCiteCreator) {
  if (creator.givenName || creator.familyName) {
    return [creator.givenName, creator.familyName].filter(Boolean).join(" ").trim();
  }
  return creator.name || "";
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

function hashStable(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

type DataCiteResponse = {
  data?: DataCiteDoi[];
};

export type DataCiteDoi = {
  id?: string;
  type?: string;
  attributes?: {
    doi?: string;
    titles?: Array<{
      title?: string;
    }>;
    publisher?: string;
    publicationYear?: number;
    creators?: DataCiteCreator[];
  };
};

type DataCiteCreator = {
  name?: string;
  nameType?: string;
  givenName?: string;
  familyName?: string;
  affiliation?: Array<string | { name?: string }>;
};
