import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestCensusAcsHousing,
  type CensusAcsHousingInput,
} from "../lib/sources/census-acs-housing";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:census-acs-housing -- --config=configs/housing-stock-sources/census-acs-2024-bay-area.json",
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
  ) as CensusAcsHousingInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Census ACS housing source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestCensusAcsHousing(config);

  console.log(`Fetched ${result.urls.length} Census ACS housing request(s).`);
  console.log(
    `Imported ${result.imported} aggregate housing stock metric(s) from ${result.fetched} row(s).`,
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
