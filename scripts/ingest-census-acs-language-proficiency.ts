import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestCensusAcsLanguageProficiency,
  type CensusAcsLanguageProficiencyInput,
} from "../lib/sources/census-acs-language-proficiency";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: CENSUS_API_KEY=... npm run ingest:census-acs-language-proficiency -- --config=configs/social-sources/census-acs-language-proficiency-2024-bay-area.json",
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
  ) as CensusAcsLanguageProficiencyInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Census ACS language proficiency source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestCensusAcsLanguageProficiency(config);

  console.log(
    `Fetched ${result.urls.length} Census ACS language proficiency request(s).`,
  );
  console.log(
    `Imported ${result.imported} aggregate language proficiency metric(s) from ${result.fetched} row(s).`,
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
