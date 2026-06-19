import { ingestStackExchangeUsers } from "../lib/sources/stack-exchange";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;
const site = args.site || "stackoverflow";

if (!query) {
  console.error(
    "Usage: npm run ingest:stack-exchange -- --query='Jane Smith' [--site=stackoverflow] [--limit=n]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestStackExchangeUsers({
    query,
    site,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} Stack Exchange user profile(s) from ${result.fetched} user result(s).`,
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

