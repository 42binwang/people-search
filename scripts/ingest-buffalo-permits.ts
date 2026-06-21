import { ingestBuffaloPermits } from "../lib/sources/buffalo-permits";

const args = parseArgs(process.argv.slice(2));
const firstName = args["first-name"] || args.firstName;
const lastName = args["last-name"] || args.lastName;
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 5000) : undefined;

if (!lastName && !query) {
  console.error(
    "Usage: npm run ingest:buffalo-permits -- --last-name=Smith [--first-name=Clara] [--limit=n]",
  );
  process.exit(1);
}

ingestBuffaloPermits({ firstName, lastName, query, limit })
  .then((result) => {
    console.log(`Fetched ${result.url}`);
    console.log(
      `Imported ${result.imported} Buffalo permit profile(s) from ${result.fetched} row(s).`,
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
