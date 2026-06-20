import { ingestFaaAirmenFromFile } from "../lib/sources/faa-airmen";

const args = parseArgs(process.argv.slice(2));
const file = args.file || args.f;

if (!file) {
  console.error(
    "Usage: npm run ingest:faa-airmen -- --file=path/to/AIRMAN.csv [--query='Jane Smith']",
  );
  process.exit(1);
}

ingestFaaAirmenFromFile({ file, query: args.query || args.q })
  .then((result) => {
    console.log(`Read ${result.url}`);
    console.log(
      `Imported ${result.imported} FAA airman profile(s) from ${result.fetched} record(s).`,
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
