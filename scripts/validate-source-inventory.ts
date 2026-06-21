/**
 * Enforce AGENTS.md's "always document a finished adapter" rule.
 *
 * Discovers every concrete source adapter in `lib/sources/` (files declaring a
 * `const sourceId`) and fails if any has no mention in `docs/data-sources.md`.
 * Run via `npm run sources:validate-inventory` (also part of `npm run presubmit`).
 */
import { readdirSync, readFileSync } from "fs";
import {
  extractSourceIdFromFile,
  findUndocumented,
  type AdapterSource,
} from "../lib/source-inventory";

const SOURCES_DIR = "lib/sources";
const DOCS_PATH = "docs/data-sources.md";

function main() {
  const docs = readFileSync(DOCS_PATH, "utf8");

  const adapters: AdapterSource[] = readdirSync(SOURCES_DIR)
    .filter((name) => name.endsWith(".ts"))
    .map((name) =>
      extractSourceIdFromFile(name, readFileSync(`${SOURCES_DIR}/${name}`, "utf8")),
    )
    .filter((adapter): adapter is AdapterSource => adapter !== null);

  const undocumented = findUndocumented(adapters, docs);

  if (undocumented.length > 0) {
    console.error(
      `✗ Source inventory check FAILED: ${undocumented.length} adapter(s) not mentioned in ${DOCS_PATH}.`,
    );
    console.error(
      "  Per AGENTS.md, every finished adapter must be documented. Add a row/entry",
    );
    console.error("  mentioning the source id or adapter filename, then re-run.\n");
    for (const adapter of undocumented) {
      console.error(
        `  - ${adapter.sourceId}  (${adapter.file})  — mention "${adapter.sourceId}" or "${adapter.stem}"`,
      );
    }
    process.exit(1);
  }

  console.log(
    `✓ Source inventory OK: all ${adapters.length} adapter(s) documented in ${DOCS_PATH}.`,
  );
}

main();
