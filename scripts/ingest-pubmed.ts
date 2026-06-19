import { ingestPubMedAuthors } from "../lib/sources/pubmed";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 100) : undefined;

if (!query) {
  console.error("Usage: npm run ingest:pubmed -- --query='Jane Smith' [--limit=n]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestPubMedAuthors({
    query,
    limit,
    email: args.email,
    apiKey: args.api_key || args.apiKey,
  });

  console.log(`Fetched ${result.searchUrl.replace(/api_key=[^&]+/, "api_key=REDACTED")}`);
  if (result.summaryUrl) {
    console.log(
      `Summarized ${result.summaryUrl.replace(/api_key=[^&]+/, "api_key=REDACTED")}`,
    );
  }
  console.log(
    `Imported ${result.imported} PubMed author mention profile(s) from ${result.fetched} PubMed record(s).`,
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

