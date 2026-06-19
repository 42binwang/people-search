import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestBlsLausCountyLabor,
  type BlsLausCountyLaborInput,
} from "../lib/sources/bls-laus-county-labor";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:bls-laus-county-labor -- --config=configs/economic-sources/bls-laus-county-labor-2024-2026-bay-area.json",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), configPath), "utf8"),
  ) as BlsLausCountyLaborInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "BLS LAUS county labor source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestBlsLausCountyLabor(config);

  console.log(`Fetched ${result.urls.length} BLS LAUS request(s).`);
  console.log(
    `Imported ${result.imported} aggregate county labor metric(s) from ${result.fetched} row(s).`,
  );
}

function parseArgs(values: string[]) {
  const parsed: Record<string, string> = {};
  for (const value of values) {
    const match = value.match(/^--([^=]+)=(.*)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}
