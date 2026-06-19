import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type GoogleBooksIngestInput = {
  query: string;
  limit?: number;
  apiKey?: string;
};

export type GoogleBooksIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "google_books_volumes";

export async function ingestGoogleBooksAuthors(
  input: GoogleBooksIngestInput,
): Promise<GoogleBooksIngestResult> {
  registerGoogleBooksSource();

  const limit = clampLimit(input.limit, 40);
  const apiKey = input.apiKey || process.env.GOOGLE_BOOKS_API_KEY;
  const url = buildGoogleBooksVolumesUrl({
    query: input.query,
    limit,
    apiKey,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchGoogleBooksIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Google Books request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as GoogleBooksVolumesResponse;
  const volumes = applyImportLimit(payload.items ?? [], limit);
  let imported = 0;

  for (const volume of volumes) {
    const profiles = mapGoogleBooksVolumeToProfileInputs(input.query, volume);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: volumes.length,
    imported,
    url: redactApiKey(url),
  };
}

export function registerGoogleBooksSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Google Books Volumes API",
    category: "Book/catalog author metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://developers.google.com/books/docs/v1/using",
    notes:
      "Google Books Volumes API. Use as book/catalog author context only; not residential, contact, employment, or identity-verification evidence.",
  });
}

export function mapGoogleBooksVolumeToProfileInputs(
  query: string,
  volume: GoogleBooksVolume,
): UpsertProfileInput[] {
  const info = volume.volumeInfo;
  const authors = info?.authors;
  const volumeId = volume.id;
  if (!volumeId || !info || !authors?.length) {
    return [];
  }

  const title = info.title || "Untitled Google Books volume";
  const queryNorm = normalizeName(query);

  return authors
    .map((author, index) => ({ author, index }))
    .filter(({ author }) => nameMatchesQuery(author, queryNorm))
    .map(({ author, index }) => ({
      id: `p_googlebooks_${slugify(author)}_${hashStable(volumeId)}_${index}`,
      fullName: author,
      ageRange: "Unknown",
      confidence: "Low",
      aliases: [
        `Book/catalog result: ${title}`,
        `Google Books volume ID: ${volumeId}`,
        info.publisher ? `Publisher: ${info.publisher}` : "",
        info.publishedDate ? `Published: ${info.publishedDate}` : "",
        info.infoLink ? `Info link: ${info.infoLink}` : "",
        info.categories?.length ? `Categories: ${info.categories.slice(0, 5).join(", ")}` : "",
      ].filter(Boolean),
      locations: [
        {
          city: "Google Books",
          state: "Global",
          kind: "book/catalog author metadata",
          sourceId,
        },
      ],
      contacts: [],
      relationships: [],
      sourceRecord: {
        sourceId,
          sourceRecordId: `${volumeId}:${index}`,
        raw: {
          volume,
          matchedAuthor: author,
        },
      },
    }));
}

function buildGoogleBooksVolumesUrl(input: {
  query: string;
  limit: number | undefined;
  apiKey?: string;
}) {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", `inauthor:"${input.query}"`);
  url.searchParams.set("projection", "lite");
  if (input.limit) {
    url.searchParams.set("maxResults", String(input.limit));
  }
  if (input.apiKey) {
    url.searchParams.set("key", input.apiKey);
  }
  return url.toString();
}

function nameMatchesQuery(name: string, queryNorm: string) {
  const nameNorm = normalizeName(name);
  const tokens = queryNorm.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
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

function redactApiKey(url: string) {
  return url.replace(/([?&]key=)[^&]+/, "$1REDACTED");
}

type GoogleBooksVolumesResponse = {
  items?: GoogleBooksVolume[];
};

export type GoogleBooksVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    infoLink?: string;
    categories?: string[];
  };
};
