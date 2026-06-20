import { ingestUcAnnualWage } from "../lib/sources/uc-annual-wage";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const year = args.year || undefined;
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!query) {
  console.error(
    "Usage: npm run ingest:uc-annual-wage -- --query='Jane Smith' [--year=2024] [--limit=n]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestUcAnnualWage({
    query,
    year,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} University of California employee profile(s) from ${result.fetched} payroll record(s).`,
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
