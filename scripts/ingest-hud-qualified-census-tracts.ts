import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudQualifiedCensusTracts,
  type HudQualifiedCensusTractsInput,
} from "../lib/sources/hud-qualified-census-tracts";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-qualified-census-tracts -- --config=configs/housing-assistance-sources/hud-qct-2026-bay-area.json",
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
  ) as HudQualifiedCensusTractsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD qualified census tracts source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudQualifiedCensusTracts(config);

  console.log(`Fetched ${result.fetched} qualified census tract row(s).`);
  console.log(`Imported ${result.imported} county QCT metric(s).`);
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
