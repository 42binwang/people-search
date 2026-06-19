import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestIrsSoiMigrationFlows,
  type IrsSoiMigrationInput,
} from "../lib/sources/irs-soi-migration";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:irs-soi-migration -- --config=configs/mobility-sources/irs-soi-2022-2023-bay-area.json",
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
  ) as IrsSoiMigrationInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "IRS SOI migration source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestIrsSoiMigrationFlows(config);

  console.log(`Fetched ${result.urls.length} IRS SOI migration file(s).`);
  console.log(
    `Imported ${result.imported} aggregate migration flow(s) from ${result.fetched} matching row(s).`,
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
