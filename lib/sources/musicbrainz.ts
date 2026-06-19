import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type MusicBrainzIngestInput = {
  query: string;
  limit?: number;
};

export type MusicBrainzIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "musicbrainz_artists";

export async function ingestMusicBrainzArtists(
  input: MusicBrainzIngestInput,
): Promise<MusicBrainzIngestResult> {
  registerMusicBrainzSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildMusicBrainzArtistUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "PeopleSearchMusicBrainzIngest/0.1 ( local-development@example.com )",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `MusicBrainz request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as MusicBrainzArtistResponse;
  const artists = applyImportLimit(payload.artists ?? [], limit);
  let imported = 0;

  for (const artist of artists) {
    const profile = mapMusicBrainzArtistToProfileInput(input.query, artist);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: artists.length,
    imported,
    url,
  };
}

export function registerMusicBrainzSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "MusicBrainz Artist Search",
    category: "Music artist metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://musicbrainz.org/doc/MusicBrainz_Database/License",
    notes:
      "MusicBrainz artist search API. Use as public music metadata context only; artist profiles are not residential, contact, employment, or identity-verification evidence.",
  });
}

export function mapMusicBrainzArtistToProfileInput(
  query: string,
  artist: MusicBrainzArtist,
): UpsertProfileInput | null {
  const displayName = artist.name || artist["sort-name"];
  if (!artist.id || !displayName || !nameMatchesQuery(displayName, query)) {
    return null;
  }

  const beginArea = artist["begin-area"]?.name;
  const area = artist.area?.name;
  const birthDate = artist["life-span"]?.begin ?? "";
  const ended = artist["life-span"]?.ended;
  const isni = artist.isnis?.[0] ?? "";

  return {
    id: `p_musicbrainz_${slugify(artist.id)}`,
    fullName: displayName,
    ageRange: birthDate ? `Born ${birthDate}` : "Unknown",
    confidence: "Low",
    aliases: [
      `MusicBrainz artist ID: ${artist.id}`,
      artist["sort-name"] ? `Sort name: ${artist["sort-name"]}` : "",
      artist.type ? `Artist type: ${artist.type}` : "",
      artist.disambiguation ? `Disambiguation: ${artist.disambiguation}` : "",
      isni ? `ISNI: ${isni}` : "",
      ended ? "MusicBrainz life-span marked ended" : "",
    ].filter(Boolean),
    locations: [
      {
        city: beginArea || area || "MusicBrainz",
        state: artist.country || "Global",
        kind: "music artist metadata",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: artist.id,
      raw: artist,
    },
  };
}

function buildMusicBrainzArtistUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://musicbrainz.org/ws/2/artist/");
  url.searchParams.set(
    "query",
    `artist:"${escapeLucenePhrase(input.query)}" AND type:person`,
  );
  url.searchParams.set("fmt", "json");
  if (input.limit) {
    url.searchParams.set("limit", String(input.limit));
  }
  return url.toString();
}

function escapeLucenePhrase(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type MusicBrainzArtistResponse = {
  artists?: MusicBrainzArtist[];
};

export type MusicBrainzArtist = {
  id?: string;
  name?: string;
  "sort-name"?: string;
  type?: string;
  country?: string;
  disambiguation?: string;
  area?: {
    name?: string;
  };
  "begin-area"?: {
    name?: string;
  };
  "life-span"?: {
    begin?: string;
    ended?: boolean | null;
  };
  isnis?: string[];
};
