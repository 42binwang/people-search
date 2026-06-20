/**
 * Pure helpers for organizing a profile's raw aliases into the public summary
 * shown on profile pages. Kept side-effect free and database-free so it can be
 * unit tested in isolation.
 *
 * Source notes are flat `"Label: value"` strings carried as aliases. Many of
 * them describe *documents that merely matched the name* (Federal Register
 * notices, Library of Congress catalog titles, orphaned dates/agencies) rather
 * than facts about one person — especially on weak name-only matches. These
 * helpers separate concise person-level facts (shown by default) from that
 * match-artifact noise (still available under "show more").
 */

export interface PublicSummaryAliases {
  names: string[];
  notes: string[];
  /**
   * How many notes to show by default before the "+N more" toggle. Equals the
   * number of useful person-level facts, so the default view shows every useful
   * note and the toggle gates only the verbose match-artifact noise.
   */
  noteDefaultLimit: number;
}

/**
 * Aliases whose value is a raw identifier or URL. These never reach the public
 * summary — they are provenance, not display content.
 */
const HIDDEN_SOURCE_ALIAS_PREFIXES = [
  "LOC ID:",
  "Resource:",
  "arXiv entry:",
  "Semantic Scholar profile:",
  "Library of Congress result:",
  "Archive identifier:",
  "Open Library author key:",
  "ORCID iD:",
  "ISNI:",
  "DOI:",
  "PMID:",
];

/**
 * Aliases that carry a sourced attribute about the person or their work. These
 * become "Source notes" rather than candidate names.
 */
const SOURCE_NOTE_PREFIXES = [
  "arXiv preprint:",
  "Published:",
  "Internet Archive item:",
  "Year:",
  "Works indexed by OpenAlex:",
  "Cited by count:",
  "Last known institution:",
  "GitHub username:",
  "GitHub profile:",
  "Public repositories:",
  "Followers:",
  "Publication:",
  "Container:",
  "Semantic Scholar author ID:",
  "Paper count:",
  "Citation count:",
  "h-index:",
  "Federal Register mention:",
  "Publication date:",
  "Top work:",
  "Work count:",
  "Subjects:",
  "Professional category:",
  "Occupation:",
  "Employer:",
  "Party:",
  "Office:",
  "Agency:",
  "Source updated:",
];

/**
 * Note prefixes that describe the *person* concisely. These are shown by
 * default; any other source note (verbose work titles, Federal Register
 * mentions, orphaned dates/agencies, raw IDs) is demoted under "show more".
 *
 * A length heuristic is intentionally avoided: orphaned short values such as
 * `Publication date: 1994-12-30` or `Agency: Justice Department` would wrongly
 * surface as "useful".
 */
const USEFUL_NOTE_PREFIXES = [
  "Last known institution:",
  "GitHub username:",
  "GitHub profile:",
  "Public repositories:",
  "Followers:",
  "h-index:",
  "Paper count:",
  "Citation count:",
  "Cited by count:",
  "Works indexed by OpenAlex:",
  "Year:",
  "Top work:",
  "Work count:",
  "Subjects:",
  "Professional category:",
  "Occupation:",
  "Employer:",
  "Party:",
  "Office:",
  "Source updated:",
];

/** Citation-metric notes that may carry the same number from two sources. */
const CITATION_BY_PREFIX = "Cited by count:";
const CITATION_COUNT_PREFIX = "Citation count:";

/**
 * Display form produced by {@link cleanSourceNote} for the GitHub profile URL.
 * Tracked separately because cleaning drops the `GitHub profile:` prefix that
 * {@link isUsefulNote} would otherwise match on.
 */
const GITHUB_PROFILE_NOTE = "GitHub profile available";

export function organizePublicSummaryAliases(
  aliases: string[],
): PublicSummaryAliases {
  const names: string[] = [];
  let notes: string[] = [];

  for (const alias of uniqueValues(aliases)) {
    if (isHiddenSourceAlias(alias)) {
      continue;
    }

    if (isSourceNoteAlias(alias)) {
      // Only keep concise person-level facts. Verbose records (work titles,
      // Federal Register mentions, orphaned dates/agencies, raw IDs) are now
      // rendered as structured lists — or dropped entirely — via
      // `lib/profile-source-records`, so they no longer pollute the summary.
      const note = cleanSourceNote(alias);
      if (isUsefulNote(note)) {
        notes.push(note);
      }
      continue;
    }

    if (isReadablePersonAlias(alias)) {
      names.push(alias);
    }
  }

  notes = dedupeCitationCounts(notes);

  return { names, notes, noteDefaultLimit: notes.length };
}

/**
 * Reorder notes so concise person-level facts appear first and verbose
 * match-artifact notes appear last. Relative order within each group is
 * preserved (stable).
 */
export function orderSourceNotes(notes: string[]): string[] {
  const useful: string[] = [];
  const other: string[] = [];

  for (const note of notes) {
    if (isUsefulNote(note)) {
      useful.push(note);
    } else {
      other.push(note);
    }
  }

  return [...useful, ...other];
}

/**
 * Collapse the OpenAlex "Cited by count: N" and Semantic Scholar
 * "Citation count: N" notes when they report the same number — they describe
 * the same author-level citation total. When the numbers differ, both are kept.
 * The Semantic Scholar "Citation count:" form is retained on conflict-free
 * dedupe.
 */
export function dedupeCitationCounts(notes: string[]): string[] {
  const citedBy = notes.find((note) => note.startsWith(CITATION_BY_PREFIX));
  const citationCount = notes.find((note) =>
    note.startsWith(CITATION_COUNT_PREFIX),
  );

  if (!citedBy || !citationCount) {
    return notes;
  }

  if (noteNumber(citedBy) !== noteNumber(citationCount)) {
    return notes;
  }

  return notes.filter((note) => !note.startsWith(CITATION_BY_PREFIX));
}

export function isHiddenSourceAlias(value: string) {
  return HIDDEN_SOURCE_ALIAS_PREFIXES.some((prefix) =>
    value.startsWith(prefix),
  );
}

export function isSourceNoteAlias(value: string) {
  return SOURCE_NOTE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isUsefulNote(value: string) {
  return (
    value === GITHUB_PROFILE_NOTE ||
    USEFUL_NOTE_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

export function isReadablePersonAlias(value: string) {
  if (
    value.length > 80 ||
    value.includes("http://") ||
    value.includes("https://")
  ) {
    return false;
  }

  const tokenCount = value
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return tokenCount > 0 && tokenCount <= 6;
}

export function cleanSourceNote(value: string) {
  if (value.startsWith("GitHub profile:")) {
    return "GitHub profile available";
  }

  if (value.length <= 140) {
    return value;
  }

  return `${value.slice(0, 137).trim()}...`;
}

function noteNumber(note: string): number | undefined {
  const match = note.match(/:\s*(-?\d+)/);
  return match ? Number(match[1]) : undefined;
}

function uniqueValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}
