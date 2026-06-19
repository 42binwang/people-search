import { createReadStream } from "fs";
import { parse } from "csv-parse";
import { upsertApprovedSource, upsertProfile } from "../lib/db";

const [, , filePath, sourceId] = process.argv;

if (!filePath || !sourceId) {
  console.error("Usage: npm run ingest:csv -- <file.csv> <approved_source_id>");
  process.exit(1);
}

upsertApprovedSource({
  id: sourceId,
  name: sourceId,
  category: "Approved CSV import",
  jurisdiction: "Configured source",
  acquisitionMethod: "bulk_file",
  notes:
    "Imported from an operator-supplied CSV. Confirm source approval before running this script.",
});

let imported = 0;

createReadStream(filePath)
  .pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }),
  )
  .on("data", (row: CsvPersonRow) => {
    if (!row.full_name || !row.city || !row.state) {
      return;
    }

    const id =
      row.profile_id ||
      `p_${sourceId}_${String(row.source_record_id || imported + 1).replace(
        /[^a-zA-Z0-9]+/g,
        "_",
      )}`;

    upsertProfile({
      id,
      fullName: row.full_name,
      ageRange: row.age_range || "Unknown",
      confidence: row.confidence || "Medium",
      aliases: splitList(row.aliases),
      locations: [
        {
          street: row.street,
          city: row.city,
          state: row.state,
          zip: row.zip,
          kind: row.location_kind || "possible",
          sourceId,
        },
      ],
      contacts: [
        ...splitList(row.phones).map((value) => ({
          type: "phone" as const,
          value,
          sourceId,
        })),
        ...splitList(row.emails).map((value) => ({
          type: "email" as const,
          value,
          sourceId,
        })),
      ],
      relationships: splitList(row.relationships).map((name) => ({
        name,
        sourceId,
      })),
      sourceRecord: {
        sourceId,
        sourceRecordId: row.source_record_id || id,
        raw: row,
      },
    });
    imported += 1;
  })
  .on("end", () => {
    console.log(`Imported ${imported} rows from ${filePath}.`);
  })
  .on("error", (error) => {
    console.error(error);
    process.exit(1);
  });

function splitList(value?: string) {
  return String(value ?? "")
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type CsvPersonRow = {
  profile_id?: string;
  source_record_id?: string;
  full_name: string;
  age_range?: string;
  confidence?: string;
  aliases?: string;
  street?: string;
  city: string;
  state: string;
  zip?: string;
  location_kind?: string;
  phones?: string;
  emails?: string;
  relationships?: string;
};

