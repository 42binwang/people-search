import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudDifficultDevelopmentAreas,
  type HudDifficultDevelopmentAreasInput,
} from "../lib/sources/hud-difficult-development-areas";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-difficult-development-areas -- --config=configs/housing-assistance-sources/hud-dda-2026-bay-area.json",
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
  ) as HudDifficultDevelopmentAreasInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD difficult development areas source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudDifficultDevelopmentAreas(config);

  console.log(`Fetched ${result.fetched} difficult development area row(s).`);
  console.log(`Imported ${result.imported} HUD DDA metric(s).`);
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
