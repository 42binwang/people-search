import { mkdirSync, writeFileSync } from "fs";
import { basename, join } from "path";
import {
  ingestIrs990OfficersFromFile,
  ingestIrs990OfficersFromZip,
} from "../lib/sources/irs-990";

const args = parseArgs(process.argv.slice(2));
const file = args.file || args.f;
const zip = args.zip || args.z;
const zipUrl = args["zip-url"];

if (!file && !zip && !zipUrl) {
  console.error(
    "Usage: npm run ingest:irs-990 -- --file=path/to/990.xml [--query='Jane Smith'] [--org-name='...']",
  );
  console.error(
    "   or: npm run ingest:irs-990 -- --zip=path/to/teos-monthly.zip [--query='Jane Smith'] [--limit=1000] [--max-files=100]",
  );
  console.error(
    "   or: npm run ingest:irs-990 -- --zip-url=https://.../download.zip --cache-dir=data/raw/irs-990 [--query='Jane Smith']",
  );
  process.exit(1);
}

run()
  .then((result) => {
    console.log(`Read ${result.url}`);
    if ("files" in result) {
      console.log(
        `Imported ${result.imported} IRS 990 officer profile(s) from ${result.fetched} Part VII officer(s) across ${result.files} XML file(s).`,
      );
    } else {
      console.log(
        `Imported ${result.imported} IRS 990 officer profile(s) from ${result.fetched} Part VII officer(s).`,
      );
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function run() {
  const query = args.query || args.q;
  if (file) {
    return ingestIrs990OfficersFromFile({
      file,
      query,
      organizationName: args["org-name"],
    });
  }

  return ingestIrs990OfficersFromZip({
    zipFile: zip || (await downloadZip(zipUrl!, args["cache-dir"])),
    query,
    limit: parseOptionalNumber(args.limit),
    maxFiles: parseOptionalNumber(args["max-files"]),
  });
}

async function downloadZip(url: string, cacheDir = "data/raw/irs-990") {
  mkdirSync(cacheDir, { recursive: true });
  const response = await fetch(url, {
    headers: { accept: "application/zip,application/octet-stream,*/*;q=0.5" },
  });
  if (!response.ok) {
    throw new Error(`IRS 990 ZIP download failed: ${response.status}`);
  }
  const fileName = basename(new URL(url).pathname) || "irs-990-teos.zip";
  const outputPath = join(cacheDir, fileName);
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
  return outputPath;
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

function parseOptionalNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
