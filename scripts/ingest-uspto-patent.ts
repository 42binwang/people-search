import { ingestUsptoPatentInventors } from "../lib/sources/uspto-patent";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 5000) : undefined;
const apiKey = args["api-key"] || args.apiKey;

if (!query) {
  console.error(
    "Usage: npm run ingest:uspto-patent -- --query='Jane Smith' [--limit=n] [--api-key=...]",
  );
  process.exit(1);
}

ingestUsptoPatentInventors({ query, limit, apiKey })
  .then((result) => {
    console.log(`Fetched ${result.url}`);
    console.log(
      `Imported ${result.imported} USPTO patent inventor profile(s) from ${result.fetched} patent(s).`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

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
