import { readFileSync } from "fs";
import { join } from "path";
import {
  ingestArcGisFeatureLayer,
  type ArcGisIngestInput,
} from "../lib/sources/arcgis";

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || args.c || "";
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 5000) : undefined;

if (!configPath) {
  console.error(
    "Usage: npm run ingest:arcgis -- --config=configs/source.json [--query='Jane Smith'] [--limit=n]",
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
  ) as ArcGisIngestInput & { approved?: boolean };

  if (!config.approved) {
    throw new Error("ArcGIS source config must set approved=true before ingestion.");
  }

  const result = await ingestArcGisFeatureLayer({
    ...config,
    query: query ?? config.query,
    limit: limit ?? config.limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} ArcGIS open-data profile(s) from ${result.fetched} feature(s).`,
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
