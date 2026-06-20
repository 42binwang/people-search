import { ingestFecScheduleAContributions } from "../lib/sources/fec-schedule-a";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const state = args.state;
const city = args.city;
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!query) {
  console.error(
    "Usage: npm run ingest:fec-schedule-a -- --query='Bin Wang' [--state=CA] [--city='SAN MATEO'] [--limit=n]",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestFecScheduleAContributions({
    query,
    state,
    city,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} individual contribution profile(s) from ${result.fetched} FEC Schedule A result(s).`,
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
