import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestCensusAcsResidentialTenure,
  type CensusAcsResidentialTenureInput,
} from "../lib/sources/census-acs-residential-tenure";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: CENSUS_API_KEY=... npm run ingest:census-acs-residential-tenure -- --config=configs/mobility-sources/census-acs-residential-tenure-2024-bay-area.json",
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
  ) as CensusAcsResidentialTenureInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Census ACS residential tenure source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestCensusAcsResidentialTenure(config);

  console.log(
    `Fetched ${result.urls.length} Census ACS residential tenure request(s).`,
  );
  console.log(
    `Imported ${result.imported} aggregate residential tenure metric(s) from ${result.fetched} row(s).`,
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
