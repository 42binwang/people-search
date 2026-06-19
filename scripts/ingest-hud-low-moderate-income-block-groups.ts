import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudLowModerateIncomeBlockGroups,
  type HudLowModerateIncomeBlockGroupsInput,
} from "../lib/sources/hud-low-moderate-income-block-groups";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-low-moderate-income-block-groups -- --config=configs/economic-sources/hud-low-mod-income-bg-2020-bay-area.json",
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
  ) as HudLowModerateIncomeBlockGroupsInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD low/moderate income block groups source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudLowModerateIncomeBlockGroups(config);

  console.log(
    `Fetched ${result.fetched} HUD low/moderate income block group row(s).`,
  );
  console.log(
    `Imported ${result.imported} HUD low/moderate income county metric(s).`,
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
