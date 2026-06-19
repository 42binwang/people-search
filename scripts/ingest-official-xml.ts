import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestOfficialXmlRecords,
  type OfficialXmlIngestInput,
} from "../lib/sources/official-xml";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 5000) : undefined;

if (!configPath) {
  console.error(
    "Usage: npm run ingest:official-xml -- --config=configs/source.json [--query='Jane Smith'] [--limit=n]",
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
  ) as OfficialXmlIngestInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error(
      "Official XML source config must set approved=true before ingestion.",
    );
  }

  const result = await ingestOfficialXmlRecords({
    ...config,
    query: query ?? config.query,
    limit: limit ?? config.limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} official XML profile(s) from ${result.fetched} record(s).`,
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
