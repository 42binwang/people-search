import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const [, , configPath] = process.argv;

if (!configPath) {
  console.error("Usage: npm run collect:source -- <source-config.json>");
  process.exit(1);
}

const config = JSON.parse(
  readFileSync(join(process.cwd(), configPath), "utf8"),
) as SourceConfig;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!config.approved) {
    throw new Error("Source config must set approved=true before collection.");
  }

  if (!["official_api", "bulk_file", "approved_html"].includes(config.method)) {
    throw new Error(`Unsupported collection method: ${config.method}`);
  }

  if (config.method === "approved_html" && !config.automationAllowed) {
    throw new Error("HTML collection requires automationAllowed=true.");
  }

  const response = await fetch(config.url, {
    headers: {
      "user-agent":
        config.userAgent ||
        "PeopleSearchSourceCollector/0.1 compliance-contact@example.com",
      accept:
        config.accept ||
        "application/json,text/csv,text/html;q=0.8,*/*;q=0.5",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  mkdirSync(join(process.cwd(), "data", "raw"), { recursive: true });
  const outputPath = join(
    process.cwd(),
    "data",
    "raw",
    `${config.sourceId}-${Date.now()}.${config.extension || "txt"}`,
  );
  writeFileSync(outputPath, body);
  console.log(`Saved approved source payload to ${outputPath}`);
}

type SourceConfig = {
  sourceId: string;
  approved: boolean;
  method: "official_api" | "bulk_file" | "approved_html";
  url: string;
  automationAllowed?: boolean;
  userAgent?: string;
  accept?: string;
  extension?: string;
};
