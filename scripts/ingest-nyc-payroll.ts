import { ingestNycPayroll } from "../lib/sources/nyc-payroll";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!query) {
  console.error(
    "Usage: npm run ingest:nyc-payroll -- --query='Jane Smith' [--limit=n]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestNycPayroll({
    query,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} NYC payroll employee profile(s) from ${result.fetched} record(s).`,
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
