import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestSocrataHousingPermits,
  type SocrataHousingPermitsInput,
} from "../lib/sources/socrata-housing-permits";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:socrata-housing-permits -- --config=configs/housing-permit-sources/source.json",
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
  ) as SocrataHousingPermitsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Socrata housing permits source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestSocrataHousingPermits(config);

  console.log(`Fetched ${result.fetched} non-personal permit row(s).`);
  console.log(`Imported ${result.imported} aggregate permit metric(s).`);
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
