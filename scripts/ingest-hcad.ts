import { ingestHcad } from "../lib/sources/hcad";

const args = parseArgs(process.argv.slice(2));
const realAcctFile = args["real-acct"] || args.r;
const ownersFile = args.owners || args.o;
const businessAcctFile = args["business-acct"] || args.b;

if (!realAcctFile || !ownersFile) {
  console.error(
    "Usage: npm run ingest:hcad -- --real-acct=path/to/real_acct.txt --owners=path/to/owners.txt [--business-acct=path/to/t_business_acct.txt] [--query='Jane Smith'] [--limit=100] [--tax-year=2026]",
  );
  process.exit(1);
}

ingestHcad({
  realAcctFile,
  ownersFile,
  businessAcctFile,
  query: args.query || args.q,
  limit: args.limit ? Number(args.limit) : undefined,
  taxYear: args["tax-year"],
})
  .then((result) => {
    console.log(`Read ${result.url}`);
    console.log(
      `Imported ${result.imported} HCAD owner profile(s) from ${result.fetched} matching owner record(s).`,
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
