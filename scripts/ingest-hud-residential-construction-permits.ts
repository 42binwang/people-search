import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudResidentialConstructionPermits,
  type HudResidentialConstructionPermitsInput,
} from "../lib/sources/hud-residential-construction-permits";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-residential-construction-permits -- --config=configs/housing-permit-sources/hud-bps-2022-bay-area.json",
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
  ) as HudResidentialConstructionPermitsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD residential construction permits source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudResidentialConstructionPermits(config);

  console.log(
    `Fetched ${result.fetched} county residential construction permit row(s).`,
  );
  console.log(
    `Imported ${result.imported} aggregate county-year permit metric(s).`,
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
