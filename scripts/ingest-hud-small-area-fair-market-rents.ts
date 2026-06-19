import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudSmallAreaFairMarketRents,
  type HudSmallAreaFairMarketRentsInput,
} from "../lib/sources/hud-small-area-fair-market-rents";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-small-area-fair-market-rents -- --config=configs/housing-assistance-sources/hud-safmr-2026-bay-area.json",
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
  ) as HudSmallAreaFairMarketRentsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD SAFMR source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudSmallAreaFairMarketRents(config);

  console.log(`Fetched ${result.fetched} HUD SAFMR row(s).`);
  console.log(`Imported ${result.imported} HUD SAFMR metric(s).`);
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
