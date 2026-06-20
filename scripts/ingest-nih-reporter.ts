import { ingestNihReporterProjects } from "../lib/sources/nih-reporter";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q;
const limit = args.limit ? Math.min(Number(args.limit), 5000) : undefined;

if (!query) {
  console.error(
    "Usage: npm run ingest:nih-reporter -- --query='Jane Smith' [--limit=n]",
  );
  process.exit(1);
}

ingestNihReporterProjects({ query, limit })
  .then((result) => {
    console.log(`Fetched ${result.url}`);
    console.log(
      `Imported ${result.imported} NIH RePORTER profile(s) from ${result.fetched} project(s).`,
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
