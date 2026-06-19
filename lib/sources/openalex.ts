import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OpenAlexIngestInput = {
  query: string;
  limit?: number;
};

export type OpenAlexIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "openalex_authors";

export async function ingestOpenAlexAuthors(
  input: OpenAlexIngestInput,
): Promise<OpenAlexIngestResult> {
  registerOpenAlexSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildOpenAlexAuthorsUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchOpenAlexIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `OpenAlex request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as OpenAlexAuthorsResponse;
  const results = applyImportLimit(payload.results ?? [], limit);
  let imported = 0;

  for (const author of results) {
    const profile = mapOpenAlexAuthorToProfileInput(author);
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

export function registerOpenAlexSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "OpenAlex Authors API",
    category: "Scholarly author profile",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://developers.openalex.org/",
    notes:
      "Official OpenAlex API. Use as scholarly author context, not residential contact or identity-verification evidence.",
  });
}

export function mapOpenAlexAuthorToProfileInput(
  author: OpenAlexAuthor,
): UpsertProfileInput | null {
  if (!author.id || !author.display_name) {
    return null;
  }

  const lastInstitution =
    author.last_known_institutions?.[0] ?? author.last_known_institution;
  const institutionName = lastInstitution?.display_name;
  const countryCode = lastInstitution?.country_code;

  const aliases = [
    author.orcid ? `ORCID: ${author.orcid}` : "",
    typeof author.works_count === "number"
      ? `Works indexed by OpenAlex: ${author.works_count}`
      : "",
    typeof author.cited_by_count === "number"
      ? `Cited by count: ${author.cited_by_count}`
      : "",
    institutionName ? `Last known institution: ${institutionName}` : "",
  ].filter(Boolean);

  return {
    id: `p_openalex_${extractOpenAlexId(author.id)}`,
    fullName: author.display_name,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: institutionName
      ? [
          {
            city: institutionName,
            state: countryCode || "Global",
            kind: "scholarly affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: author.id,
      raw: author,
    },
  };
}

function buildOpenAlexAuthorsUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://api.openalex.org/authors");
  url.searchParams.set("search", input.query);
  if (input.limit) {
    url.searchParams.set("per-page", String(input.limit));
  }
  return url.toString();
}

function extractOpenAlexId(id: string) {
  return id.split("/").pop()?.replace(/[^a-zA-Z0-9]+/g, "_") || "unknown";
}

type OpenAlexAuthorsResponse = {
  results?: OpenAlexAuthor[];
};

export type OpenAlexAuthor = {
  id: string;
  display_name: string;
  orcid?: string | null;
  works_count?: number;
  cited_by_count?: number;
  last_known_institution?: OpenAlexInstitution | null;
  last_known_institutions?: OpenAlexInstitution[];
};

type OpenAlexInstitution = {
  display_name?: string;
  country_code?: string;
};
