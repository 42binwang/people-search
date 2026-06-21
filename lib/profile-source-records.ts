/**
 * Turn a profile's structured `source_records` (raw upstream payloads) into
 * typed lists for display: authored **works** (papers, preprints, books,
 * datasets) and **profiles/accounts** (GitHub, scholarly author profiles).
 *
 * This replaces the old "source notes" pill soup, which flattened these
 * records into disconnected `"Label: value"` aliases and lost all structure.
 *
 * Defensive by design: each source's stored `raw_json` wrapping is
 * inconsistent (some wrap in `{entry}`, `{work}`, `{doc}`; others store the
 * item directly), so verified sources get an explicit extractor and everything
 * else falls through to a conservative generic probe that only emits an item
 * when it can find both a title and a link.
 */

import type { ProfileSourceRecord } from "@/lib/db";

export interface WorkItem {
  title: string;
  url?: string;
  detail: string;
  sources: string[];
}

export interface ProfileItem {
  label: string;
  url?: string;
  detail: string;
}

export interface ProfileRecordSummary {
  works: WorkItem[];
  profiles: ProfileItem[];
}

/** Keyword-match sources to drop entirely (not the person's works/profiles). */
const DROP_SOURCE_IDS = new Set([
  "federal_register_documents",
  "library_of_congress_search",
]);

/** Sources whose record represents the person's own account/author profile. */
const PROFILE_SOURCE_IDS = new Set([
  "github_users",
  "openalex_authors",
  "semantic_scholar_authors",
  "orcid_public_registry",
  "stack_exchange",
  "wikidata",
]);

const SHORT_SOURCE_LABELS: Record<string, string> = {
  arxiv_api: "arXiv",
  crossref_works: "Crossref",
  internet_archive_advanced_search: "Internet Archive",
  pubmed: "PubMed",
  europe_pmc: "Europe PMC",
  datacite_dois: "DataCite",
  google_books: "Google Books",
  open_library: "Open Library",
  musicbrainz: "MusicBrainz",
  viaf: "VIAF",
};

export function normalizeProfileRecords(
  records: ProfileSourceRecord[],
): ProfileRecordSummary {
  const worksByKey = new Map<string, WorkItem>();
  const profiles: ProfileItem[] = [];
  const seenProfileUrls = new Set<string>();

  const addProfile = (item: ProfileItem) => {
    const key = (item.url ?? item.label).toLowerCase();
    if (seenProfileUrls.has(key)) {
      return;
    }
    seenProfileUrls.add(key);
    profiles.push(item);
  };

  for (const record of records) {
    if (DROP_SOURCE_IDS.has(record.sourceId)) {
      continue;
    }

    const isProfileSource = PROFILE_SOURCE_IDS.has(record.sourceId);
    if (isProfileSource) {
      const profile = extractProfile(record);
      if (profile) {
        addProfile(profile);
      }
    }

    // Every approved source record is also scanned for self-declared external
    // profile/account URLs (LinkedIn, ORCID, Scholar, X/Twitter) that appear
    // verbatim in the raw payload. These are surfaced as OUTBOUND LINKS ONLY —
    // we never scrape the linked platform, and we never construct or guess URLs.
    const raw = parseJson(record.rawJson);
    if (raw) {
      for (const link of extractProfileLinks(raw)) {
        addProfile(link);
      }
    }

    if (!isProfileSource) {
      const work = extractWork(record);
      if (work) {
        mergeWork(worksByKey, work, record.sourceId);
      }
    }
  }

  const works = Array.from(worksByKey.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return { works, profiles };
}

function mergeWork(
  worksByKey: Map<string, WorkItem>,
  work: Omit<WorkItem, "sources">,
  sourceId: string,
) {
  const key = normalizeTitle(work.title);
  if (!key) {
    return;
  }

  const label = SHORT_SOURCE_LABELS[sourceId];
  const existing = worksByKey.get(key);
  if (existing) {
    if (label && !existing.sources.includes(label)) {
      existing.sources.push(label);
    }
    if (!existing.url && work.url) {
      existing.url = work.url;
    }
    return;
  }

  worksByKey.set(key, {
    ...work,
    sources: label ? [label] : [],
  });
}

function extractWork(
  record: ProfileSourceRecord,
): Omit<WorkItem, "sources"> | null {
  const raw = parseJson(record.rawJson);
  if (!raw) {
    return null;
  }

  switch (record.sourceId) {
    case "arxiv_api": {
      const title = stringAt(raw, ["entry", "title"]);
      if (!title) return null;
      return {
        title,
        url: stringAt(raw, ["entry", "id"]),
        detail: joinDetail(yearFromIso(stringAt(raw, ["entry", "published"])), "arXiv"),
      };
    }
    case "crossref_works": {
      const title = stringAt(raw, ["work", "title", 0]);
      if (!title) return null;
      const venue =
        stringAt(raw, ["work", "container-title", 0]) ??
        stringAt(raw, ["work", "publisher"]) ??
        stringAt(raw, ["work", "type"]);
      const year =
        numberAt(raw, ["work", "published-print", "date-parts", 0, 0]) ??
        numberAt(raw, ["work", "published-online", "date-parts", 0, 0]) ??
        numberAt(raw, ["work", "created", "date-parts", 0, 0]);
      return {
        title,
        url: stringAt(raw, ["work", "DOI"])
          ? `https://doi.org/${stringAt(raw, ["work", "DOI"])}`
          : undefined,
        detail: joinDetail(year != null ? String(year) : undefined, venue),
      };
    }
    case "internet_archive_advanced_search": {
      const title = stringAt(raw, ["doc", "title"]);
      if (!title) return null;
      const year = numberAt(raw, ["doc", "year"]);
      const identifier = stringAt(raw, ["doc", "identifier"]);
      return {
        title,
        url: identifier ? `https://archive.org/details/${identifier}` : undefined,
        detail: joinDetail(year != null ? String(year) : undefined, "Internet Archive"),
      };
    }
    case "nih_reporter": {
      const title = stringAt(raw, ["project", "project_title"]);
      if (!title) return null;
      const applId = numberAt(raw, ["project", "appl_id"]);
      const year = numberAt(raw, ["project", "fiscal_year"]);
      const org = stringAt(raw, ["project", "organization", "org_name"]);
      return {
        title,
        url:
          applId != null
            ? `https://reporter.nih.gov/project-details/${applId}`
            : undefined,
        detail: joinDetail(
          year != null ? String(year) : undefined,
          [org, "NIH-funded project"].filter(Boolean).join(", ") || undefined,
        ),
      };
    }
    case "nsf_award_search": {
      const title = stringAt(raw, ["award", "title"]);
      if (!title) return null;
      const awardId = stringAt(raw, ["award", "id"]);
      const org = stringAt(raw, ["award", "awardeeName"]);
      const year = yearFromIso(stringAt(raw, ["award", "startDate"]));
      return {
        title,
        url: awardId
          ? `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${awardId}`
          : undefined,
        detail: joinDetail(
          year,
          [org, "NSF award"].filter(Boolean).join(", ") || undefined,
        ),
      };
    }
    default:
      return genericWork(raw);
  }
}

function extractProfile(record: ProfileSourceRecord): ProfileItem | null {
  const raw = parseJson(record.rawJson);
  if (!raw) {
    return null;
  }

  switch (record.sourceId) {
    case "github_users": {
      const login = stringAt(raw, ["login"]);
      if (!login) return null;
      const name = stringAt(raw, ["name"]);
      const location = stringAt(raw, ["location"]);
      return {
        label: name && name !== login ? `${name} (@${login})` : `@${login}`,
        url: stringAt(raw, ["html_url"]),
        detail: location ? `GitHub · ${location}` : "GitHub",
      };
    }
    case "openalex_authors": {
      const label = stringAt(raw, ["display_name"]);
      if (!label) return null;
      const worksCount = numberAt(raw, ["works_count"]) ?? 0;
      const citations = numberAt(raw, ["cited_by_count"]) ?? 0;
      return {
        label,
        url: stringAt(raw, ["id"]),
        detail: `OpenAlex · ${worksCount} works · ${citations} citations`,
      };
    }
    case "semantic_scholar_authors": {
      const label = stringAt(raw, ["name"]);
      if (!label) return null;
      const papers = numberAt(raw, ["paperCount"]) ?? 0;
      const hIndex = numberAt(raw, ["hIndex"]) ?? 0;
      return {
        label,
        url: stringAt(raw, ["url"]),
        detail: `Semantic Scholar · ${papers} papers · h-index ${hIndex}`,
      };
    }
    case "orcid_public_registry": {
      const orcidId = stringAt(raw, ["orcid-id"]);
      if (!orcidId) return null;
      const label =
        stringAt(raw, ["credit-name"]) ??
        [stringAt(raw, ["given-names"]), stringAt(raw, ["family-names"])]
          .filter(Boolean)
          .join(" ");
      return {
        label: label || orcidId,
        url: `https://orcid.org/${orcidId}`,
        detail: "ORCID",
      };
    }
    default:
      return genericProfile(raw);
  }
}

/** Conservative fallback: only emit when both a title and a link are found. */
function genericWork(raw: Record<string, unknown>): Omit<WorkItem, "sources"> | null {
  const title =
    stringAt(raw, ["title"]) ??
    stringAt(raw, ["entry", "title"]) ??
    stringAt(raw, ["work", "title", 0]) ??
    stringAt(raw, ["doc", "title"]) ??
    stringAt(raw, ["attributes", "titles", 0, "title"]) ??
    stringAt(raw, ["volumeInfo", "title"]);
  const url =
    stringAt(raw, ["url"]) ??
    stringAt(raw, ["html_url"]) ??
    stringAt(raw, ["link"]) ??
    stringAt(raw, ["id"]) ??
    stringAt(raw, ["entry", "id"]);

  if (!title || !url) {
    return null;
  }

  const year = numberAt(raw, ["year"]);
  return {
    title,
    url,
    detail: joinDetail(year != null ? String(year) : undefined, undefined),
  };
}

function genericProfile(raw: Record<string, unknown>): ProfileItem | null {
  const label =
    stringAt(raw, ["display_name"]) ??
    stringAt(raw, ["name"]) ??
    stringAt(raw, ["login"]);
  const url =
    stringAt(raw, ["url"]) ??
    stringAt(raw, ["html_url"]) ??
    stringAt(raw, ["link"]) ??
    stringAt(raw, ["id"]);
  if (!label || !url) {
    return null;
  }
  return { label, url, detail: "Public profile" };
}

/**
 * Profile-platform URL patterns. GitHub is intentionally omitted here: a
 * GitHub *profile* URL is indistinguishable from a *repository* URL by pattern
 * alone, so GitHub profiles are surfaced only via the dedicated github_users
 * extractor (which reads the structured `html_url`). LinkedIn/ORCID/Scholar/X
 * are unambiguously person-profile URLs and are safe to extract from any
 * approved source's raw payload.
 */
const PROFILE_LINK_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "LinkedIn",
    re: /https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_%-]+/i,
  },
  {
    label: "ORCID",
    re: /https?:\/\/(?:sandbox\.)?orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i,
  },
  {
    label: "Google Scholar",
    re: /https?:\/\/scholar\.google\.com\/citations\?user=[A-Za-z0-9_-]+/i,
  },
  {
    label: "X (Twitter)",
    re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!home|explore|search|i\/|hashtag)[A-Za-z0-9_]{1,15}/i,
  },
];

/**
 * Scan a source record's raw payload for self-declared profile/account URLs.
 * The URL must appear verbatim in approved source data — we never construct or
 * infer one (e.g. never guess linkedin.com/in/firstname-lastname).
 */
function extractProfileLinks(raw: Record<string, unknown>): ProfileItem[] {
  const found = new Map<string, ProfileItem>();
  for (const url of collectUrls(raw)) {
    const cleaned = url.replace(/[.,;:)\]"']+$/, "");
    const pattern = PROFILE_LINK_PATTERNS.find((entry) => entry.re.test(cleaned));
    if (!pattern) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (!found.has(key)) {
      found.set(key, { label: pattern.label, url: cleaned, detail: pattern.label });
    }
  }
  return Array.from(found.values());
}

function collectUrls(value: unknown): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      for (const match of node.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) {
        if (!seen.has(match[0])) {
          seen.add(match[0]);
          urls.push(match[0]);
        }
      }
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === "object") {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return urls;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Walk a path of keys/indexes and return the first string found. */
function stringAt(value: unknown, path: Array<string | number>): string | undefined {
  const found = readPath(value, path);
  if (typeof found === "string" && found.trim()) {
    return found.trim();
  }
  if (Array.isArray(found)) {
    for (const item of found) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }
    }
  }
  return undefined;
}

function numberAt(value: unknown, path: Array<string | number>): number | undefined {
  const found = readPath(value, path);
  return typeof found === "number" ? found : undefined;
}

function readPath(value: unknown, path: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function joinDetail(year: string | undefined, venue: string | undefined): string {
  return [year, venue].filter(Boolean).join(" · ");
}

function yearFromIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d{4})/);
  return match ? match[1] : undefined;
}
