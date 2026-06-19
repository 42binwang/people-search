import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestHudHousingChoiceVouchers,
  type HudHousingChoiceVouchersInput,
} from "../lib/sources/hud-housing-choice-vouchers";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";

if (!configPath) {
  console.error(
    "Usage: npm run ingest:hud-housing-choice-vouchers -- --config=configs/housing-assistance-sources/hud-hcv-2025-bay-area.json",
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
  ) as HudHousingChoiceVouchersInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "HUD housing choice vouchers source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestHudHousingChoiceVouchers(config);

  console.log(`Fetched ${result.fetched} aggregate tract voucher row(s).`);
  console.log(`Imported ${result.imported} housing assistance metric(s).`);
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
