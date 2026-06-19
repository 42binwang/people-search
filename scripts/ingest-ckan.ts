import { readFileSync } from "fs";
import { join } from "path";
import { ingestCkanDataStore, type CkanIngestInput } from "../lib/sources/ckan";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 5000) : undefined;

if (!configPath) {
  console.error(
    "Usage: npm run ingest:ckan -- --config=configs/source.json [--query='Jane Smith'] [--limit=n]",
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
  ) as CkanIngestInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error("CKAN source config must set approved=true before ingestion.");
  }

  const result = await ingestCkanDataStore({
    ...config,
    query: query ?? config.query,
    limit: limit ?? config.limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} CKAN open-data profile(s) from ${result.fetched} record(s).`,
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
