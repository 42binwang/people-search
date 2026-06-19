import { ingestGitHubUsers } from "../lib/sources/github";

const args = parseArgs(process.argv.slice(2));
const query = args.query || args.q || "";
const limit = args.limit ? Math.min(Number(args.limit), 30) : undefined;

if (!query) {
  console.error("Usage: npm run ingest:github -- --query='Jane Smith' [--limit=n]");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const result = await ingestGitHubUsers({
    query,
    limit,
    token: args.token,
  });

  console.log(`Fetched ${result.url}`);
  console.log(
    `Imported ${result.imported} GitHub user profile(s) from ${result.fetched} user search result(s).`,
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

