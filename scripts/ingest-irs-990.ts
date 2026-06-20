import { ingestIrs990OfficersFromFile } from "../lib/sources/irs-990";

const args = parseArgs(process.argv.slice(2));
const file = args.file || args.f;

if (!file) {
  console.error(
    "Usage: npm run ingest:irs-990 -- --file=path/to/990.xml [--query='Jane Smith'] [--org-name='...']",
  );
  process.exit(1);
}

ingestIrs990OfficersFromFile({
  file,
  query: args.query || args.q,
  organizationName: args["org-name"],
})
  .then((result) => {
    console.log(`Read ${result.url}`);
    console.log(
      `Imported ${result.imported} IRS 990 officer profile(s) from ${result.fetched} Part VII officer(s).`,
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
