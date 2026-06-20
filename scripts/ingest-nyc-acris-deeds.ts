import { ingestNycAcrisDeeds } from "../lib/sources/nyc-acris-deeds";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!query) {
  console.error(
    "Usage: npm run ingest:nyc-acris-deeds -- --query='Jane Smith' [--limit=n]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestNycAcrisDeeds({
    query,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} NYC ACRIS party profile(s) from ${result.fetched} recorded document party record(s).`,
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
