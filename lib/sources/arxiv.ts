import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type ArxivIngestInput = {
  query: string;
  limit?: number;
};

export type ArxivIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "arxiv_api";

export async function ingestArxivAuthors(
  input: ArxivIngestInput,
): Promise<ArxivIngestResult> {
  registerArxivSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildArxivUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/atom+xml, application/xml, text/xml",
      "user-agent": "PeopleSearchArxivIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`arXiv request failed: ${response.status} ${response.statusText}`);
  }

  const entries = applyImportLimit(parseArxivAtom(await response.text()), limit);
  let imported = 0;

  for (const entry of entries) {
    const profiles = mapArxivEntryToProfileInputs(input.query, entry);
    for (const profile of profiles) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return {
    fetched: entries.length,
    imported,
    url,
  };
}

export function registerArxivSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "arXiv API",
    category: "arXiv author metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://info.arxiv.org/help/api/index.html",
    notes:
      "Official arXiv API. Use as preprint author context only; not residential or contact evidence. Thank you to arXiv for use of its open access interoperability.",
  });
}

export function mapArxivEntryToProfileInputs(
  query: string,
  entry: ArxivEntry,
): UpsertProfileInput[] {
  if (!entry.id || !entry.authors.length) {
    return [];
  }

  return entry.authors
    .map((author, index) => ({ author, index }))
    .filter(({ author }) => nameMatchesQuery(author, query))
    .map(({ author, index }) => ({
      id: `p_arxiv_${slugify(author)}_${hashStable(entry.id)}_${index}`,
      fullName: author,
      ageRange: "Unknown",
      confidence: "Low",
      aliases: [
        entry.title ? `arXiv preprint: ${entry.title}` : "",
        `arXiv entry: ${entry.id}`,
        entry.published ? `Published: ${entry.published}` : "",
      ].filter(Boolean),
      locations: [
        {
          city: "arXiv",
          state: "Global",
          kind: "preprint author metadata",
          sourceId,
        },
      ],
      contacts: [],
      relationships: [],
      sourceRecord: {
        sourceId,
        sourceRecordId: `${entry.id}:${index}`,
        raw: {
          entry,
          matchedAuthor: author,
        },
      },
    }));
}

export function parseArxivAtom(xml: string): ArxivEntry[] {
  return Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).map((match) => {
    const entryXml = match[1];
    return {
      id: getFirstTagText(entryXml, "id"),
      title: compactWhitespace(getFirstTagText(entryXml, "title")),
      published: getFirstTagText(entryXml, "published"),
      authors: Array.from(entryXml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g))
        .map((authorMatch) => decodeXml(authorMatch[1]).trim())
        .filter(Boolean),
    };
  });
}

function buildArxivUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `au:"${input.query}"`);
  url.searchParams.set("start", "0");
  if (input.limit) {
    url.searchParams.set("max_results", String(input.limit));
  }
  return url.toString();
}

function getFirstTagText(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXml(match[1]).trim() : "";
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
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

export type ArxivEntry = {
  id: string;
  title: string;
  published: string;
  authors: string[];
};
