import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestOpendatasoftRecords,
  type OpendatasoftIngestInput,
} from "../lib/sources/opendatasoft";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!configPath) {
  console.error(
    "Usage: npm run ingest:opendatasoft -- --config=configs/source.json [--query='Jane Smith'] [--limit=n]",
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
  ) as OpendatasoftIngestInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Opendatasoft source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestOpendatasoftRecords({
    ...config,
    query: query ?? config.query,
    limit: limit ?? config.limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} Opendatasoft profile(s) from ${result.fetched} record(s).`,
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
