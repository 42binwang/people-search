import { ingestOhioSosBusinessFromFile } from "../lib/sources/ohio-sos-business";

const args = parseArgs(process.argv.slice(2));
const file = args.file || args.f;

if (!file) {
  console.error(
    "Usage: npm run ingest:ohio-sos-business -- --file=path/to/ohio-business.csv [--query='Jane Smith']",
  );
  process.exit(1);
}

ingestOhioSosBusinessFromFile({ file, query: args.query || args.q })
  .then((result) => {
    console.log(`Read ${result.url}`);
    console.log(
      `Imported ${result.imported} Ohio business profile(s) from ${result.fetched} record(s).`,
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
