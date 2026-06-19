import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestCensusLehdLodes,
  type CensusLehdLodesInput,
} from "../lib/sources/census-lehd-lodes";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:census-lehd-lodes -- --config=configs/mobility-sources/census-lehd-lodes-2023-bay-area.json",
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
  ) as CensusLehdLodesInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Census LEHD LODES source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestCensusLehdLodes(config);

  console.log(`Read ${result.fetched} Census LEHD LODES OD row(s).`);
  console.log(`Imported ${result.imported} aggregate county commute flow(s).`);
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
