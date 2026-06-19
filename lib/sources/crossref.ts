import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type CrossrefIngestInput = {
  query: string;
  limit?: number;
  mailto?: string;
};

export type CrossrefIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "crossref_works";

export async function ingestCrossrefWorks(
  input: CrossrefIngestInput,
): Promise<CrossrefIngestResult> {
  registerCrossrefSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildCrossrefWorksUrl({
    query: input.query,
    limit,
    mailto:
      input.mailto ||
      process.env.CROSSREF_MAILTO ||
      "people-search-local@example.com",
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "PeopleSearchCrossrefIngest/0.1 (local-development; mailto:people-search-local@example.com)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Crossref request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as CrossrefWorksResponse;
  const works = applyImportLimit(payload.message?.items ?? [], limit);
  let imported = 0;

  for (const work of works) {
    const profiles = mapCrossrefWorkToProfileInputs(input.query, work);
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

export function registerCrossrefSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Crossref Works API",
    category: "Scholarly work author mention",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/",
    notes:
      "Official Crossref REST API. Use as scholarly publication author context only; not residential or contact evidence.",
  });
}

export function mapCrossrefWorkToProfileInputs(
  query: string,
  work: CrossrefWork,
): UpsertProfileInput[] {
  if (!work.DOI || !work.author?.length) {
    return [];
  }

  const doi = work.DOI;
  const title = work.title?.[0] ?? "Untitled Crossref work";
  const container = work["container-title"]?.[0];
  const year = work.issued?.["date-parts"]?.[0]?.[0];
  const queryNorm = normalizeName(query);

  return work.author
    .map((author, index) => ({ author, index }))
    .filter(({ author }) => authorNameMatchesQuery(author, queryNorm))
    .map(({ author, index }) => {
      const fullName = formatAuthorName(author);
      const affiliations = (author.affiliation ?? [])
        .map((affiliation) => affiliation.name)
        .filter((name): name is string => Boolean(name));

      return {
        id: `p_crossref_${slugify(fullName)}_${hashStable(doi)}_${index}`,
        fullName,
        ageRange: "Unknown",
        confidence: "Low",
        aliases: [
          `Publication: ${title}`,
          `DOI: ${doi}`,
          container ? `Container: ${container}` : "",
          year ? `Published: ${year}` : "",
        ].filter(Boolean),
        locations: affiliations.length
          ? affiliations.map((affiliation) => ({
              city: affiliation,
              state: "Global",
              kind: "scholarly affiliation",
              sourceId,
            }))
          : [
              {
                city: "Crossref",
                state: "Global",
                kind: "scholarly work author mention",
                sourceId,
              },
            ],
        contacts: [],
        relationships: [],
        sourceRecord: {
          sourceId,
          sourceRecordId: `${doi}:${index}`,
          raw: {
            work,
            matchedAuthor: author,
          },
        },
      };
    });
}

function buildCrossrefWorksUrl(input: {
  query: string;
  limit: number | undefined;
  mailto: string;
}) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.author", input.query);
  if (input.limit) {
    url.searchParams.set("rows", String(input.limit));
  }
  url.searchParams.set("mailto", input.mailto);
  return url.toString();
}

function authorNameMatchesQuery(author: CrossrefAuthor, queryNorm: string) {
  const authorNorm = normalizeName(formatAuthorName(author));
  const tokens = queryNorm.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => authorNorm.includes(token));
}

function formatAuthorName(author: CrossrefAuthor) {
  return [author.given, author.family]
    .filter(Boolean)
    .join(" ")
    .trim();
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

type CrossrefWorksResponse = {
  message?: {
    items?: CrossrefWork[];
  };
};

export type CrossrefWork = {
  DOI?: string;
  title?: string[];
  "container-title"?: string[];
  issued?: {
    "date-parts"?: number[][];
  };
  author?: CrossrefAuthor[];
};

type CrossrefAuthor = {
  given?: string;
  family?: string;
  affiliation?: Array<{
    name?: string;
  }>;
};
