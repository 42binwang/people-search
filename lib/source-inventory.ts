/**
 * Source-inventory consistency checks.
 *
 * AGENTS.md requires that every finished source adapter be documented in
 * `docs/data-sources.md`. Prose rules get missed under load, so this module
 * makes the check machine-enforceable: an adapter is "documented" if its
 * canonical `sourceId` OR its filename stem appears anywhere in the docs.
 *
 * Kept pure (no filesystem) so it can be unit-tested; the runner in
 * `scripts/validate-source-inventory.ts` wires it to disk.
 */

export type AdapterSource = {
  /** Adapter filename without extension, e.g. "buffalo-permits". */
  stem: string;
  /** Canonical source id declared in the adapter, e.g. "buffalo_ny_building_permits". */
  sourceId: string;
  /** Adapter file path (for error messages). */
  file: string;
};

const SOURCE_ID_RE =
  /(?:const|export\s+const)\s+sourceId\s*=\s*["']([A-Za-z0-9_]+)["']/;

/** Extract the declared sourceId from an adapter file's source text. */
export function extractSourceIdFromFile(
  file: string,
  content: string,
): AdapterSource | null {
  const stem = file.replace(/\.ts$/, "").replace(/^.*\//, "");
  const match = content.match(SOURCE_ID_RE);
  if (!match) {
    return null;
  }
  return { stem, sourceId: match[1], file };
}

/**
 * An adapter counts as documented if either its canonical sourceId or its
 * filename stem appears in the docs text. Matching is normalized to lowercase
 * alphanumerics so a hyphenated stem ("clinical-trials") or underscore id
 * ("clinicaltrials_gov_studies") still matches a display name in the docs
 * ("ClinicalTrials.gov"); only letters/digits are compared.
 */
function alnum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isDocumented(adapter: AdapterSource, docs: string): boolean {
  const docsNorm = alnum(docs);
  return (
    docsNorm.includes(alnum(adapter.sourceId)) ||
    docsNorm.includes(alnum(adapter.stem))
  );
}

/** Return the adapters that have no mention in the docs (the gaps to fix). */
export function findUndocumented(
  adapters: AdapterSource[],
  docs: string,
): AdapterSource[] {
  return adapters.filter((adapter) => !isDocumented(adapter, docs));
}
