import { ingestFlSunbiz } from "../lib/sources/fl-sunbiz";

const args = parseArgs(process.argv.slice(2));
const firstName = args["first-name"] || args.firstName || "";
const lastName = args["last-name"] || args.lastName || "";
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!firstName && !lastName && !query) {
  console.error(
    "Usage: npm run ingest:fl-sunbiz -- --query='Jane Smith' [--limit=n]",
  );
  console.error(
    "       npm run ingest:fl-sunbiz -- --first-name=Jane --last-name=Smith",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestFlSunbiz({
    firstName,
    lastName,
    query,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} Sunbiz officer profile(s) from ${result.fetched} matched officer record(s).`,
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
