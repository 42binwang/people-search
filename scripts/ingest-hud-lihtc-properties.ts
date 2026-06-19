import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudLihtcProperties,
  type HudLihtcPropertiesInput,
} from "../lib/sources/hud-lihtc-properties";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-lihtc-properties -- --config=configs/housing-assistance-sources/hud-lihtc-properties-bay-area.json",
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
  ) as HudLihtcPropertiesInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD LIHTC properties source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudLihtcProperties(config);

  console.log(`Fetched ${result.fetched} LIHTC property row(s).`);
  console.log(`Imported ${result.imported} county LIHTC inventory metric(s).`);
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
