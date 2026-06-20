import { ingestSecEdgarInsiders } from "../lib/sources/sec-edgar-insiders";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!query) {
  console.error(
    "Usage: npm run ingest:sec-edgar-insiders -- --query='Elon Musk' [--limit=n]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestSecEdgarInsiders({
    query,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} SEC EDGAR insider profile(s) from ${result.fetched} Form 3/4/5 filing(s).`,
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
