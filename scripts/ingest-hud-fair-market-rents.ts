import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudFairMarketRents,
  type HudFairMarketRentsInput,
} from "../lib/sources/hud-fair-market-rents";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-fair-market-rents -- --config=configs/housing-assistance-sources/hud-fmr-2026-bay-area.json",
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
  ) as HudFairMarketRentsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD FMR source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudFairMarketRents(config);

  console.log(`Fetched ${result.fetched} HUD FMR row(s).`);
  console.log(`Imported ${result.imported} HUD FMR metric(s).`);
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
