import { ingestNppes } from "../lib/sources/nppes";

const args = parseArgs(process.argv.slice(2));
const firstName = args.first || args.first_name || "";
const lastName = args.last || args.last_name || "";
const state = args.state || "";
const city = args.city || "";
const limit = Math.min(Number(args.limit || 10), 50);

if (!lastName && !args.npi) {
  console.error(
    "Usage: npm run ingest:nppes -- --last=Smith [--first=John] [--state=CA] [--city=San Francisco] [--limit=10]",
  );
  console.error("   or: npm run ingest:nppes -- --npi=1234567890");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestNppes({
    npi: args.npi,
    firstName,
    lastName,
    city,
    state,
    limit,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} active individual provider profiles from ${result.fetched} NPPES result(s).`,
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

