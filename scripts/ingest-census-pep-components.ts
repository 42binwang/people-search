import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestCensusPepComponents,
  type CensusPepComponentsInput,
} from "../lib/sources/census-pep-components";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:census-pep-components -- --config=configs/mobility-sources/census-pep-2025-bay-area.json",
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
  ) as CensusPepComponentsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Census PEP components source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestCensusPepComponents(config);

  console.log(`Fetched ${result.fetched} Census PEP row(s).`);
  console.log(`Imported ${result.imported} aggregate population-change metric(s).`);
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
