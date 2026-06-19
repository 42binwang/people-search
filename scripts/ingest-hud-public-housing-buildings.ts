import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudPublicHousingBuildings,
  type HudPublicHousingBuildingsInput,
} from "../lib/sources/hud-public-housing-buildings";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-public-housing-buildings -- --config=configs/housing-assistance-sources/hud-public-housing-buildings-2025-bay-area.json",
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
  ) as HudPublicHousingBuildingsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD public housing buildings source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudPublicHousingBuildings(config);

  console.log(`Fetched ${result.fetched} public housing building row(s).`);
  console.log(`Imported ${result.imported} county inventory metric(s).`);
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
