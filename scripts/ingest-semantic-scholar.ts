import { ingestSemanticScholarAuthors } from "../lib/sources/semantic-scholar";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;
const apiKey = args.apiKey || args["api-key"];

if (!query) {
  console.error(
    "Usage: npm run ingest:semantic-scholar -- --query='Jane Smith' [--limit=n] [--api-key=key]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestSemanticScholarAuthors({
    query,
    limit,
    apiKey,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} Semantic Scholar author profile(s) from ${result.fetched} author result(s).`,
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
