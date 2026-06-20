import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";

export type FaaAirmenIngestInput = {
  /** Path to an FAA Releasable Airmen CSV (e.g. AIRMAN.csv from the bulk ZIP). */
  file: string;
  /** Optional person name; when set, only airmen matching it become profiles. */
  query?: string;
};

export type FaaAirmenIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "faa_airmen_registry";

// FAA Airmen are NOT queryable by name via an API; the public data is a bulk
// download (Releasable Airmen ZIP with CSV files). This adapter parses an
// extracted AIRMAN CSV. Airmen may opt out of address disclosure, in which case
// the address columns are withheld — those records keep only the name and a
// "address withheld" note (never a fabricated address). A mailing address is
// not proof of residence.
export async function ingestFaaAirmenFromFile(
  input: FaaAirmenIngestInput,
): Promise<FaaAirmenIngestResult> {
  registerFaaAirmenSource();

  const csv = readFileSync(input.file, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as FaaAirmenRow[];

  const profiles = rows
    .map((row) => mapFaaAirmenRowToProfileInput(row, input.query ?? ""))
    .filter((profile): profile is UpsertProfileInput => Boolean(profile));

  for (const profile of profiles) {
    upsertProfile(profile);
  }

  return { fetched: rows.length, imported: profiles.length, url: input.file };
}

export function registerFaaAirmenSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "FAA Airmen Registry",
    category: "Federal airman certificate",
    jurisdiction: "United States",
    acquisitionMethod: "official_bulk",
    licenseUrl:
      "https://www.faa.gov/licenses_certificates/airmen_certification/releasable_airmen_database",
    notes:
      "FAA Releasable Airmen bulk data (public record). Use as airman certificate context only; mailing address is not a residence, and opted-out addresses are withheld (not inferred).",
  });
}

export type FaaAirmenRow = Record<string, string>;

export function mapFaaAirmenRowToProfileInput(
  row: FaaAirmenRow,
  query: string,
): UpsertProfileInput | null {
  const firstName = pick(row, "FIRST_NAME", "first_name", "FIRSTNAME");
  const lastName = pick(row, "LAST_NAME", "last_name", "LASTNAME");
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (!fullName) {
    return null;
  }
  if (query && !nameMatchesQuery(fullName, query)) {
    return null;
  }

  const recordId =
    pick(row, "UNIQUE_INSP_ID", "UNIQUE_INSPECTOR_IDNR", "unique_insp_id") ||
    fullName;
  const street = pick(row, "STREET1", "street1", "STREET");
  const city = pick(row, "CITY", "city");
  const state = pick(row, "STATE", "state");
  const zip = pick(row, "ZIP_CODE", "ZIP", "zip");
  const cert = pick(row, "CERT_TYPE", "GRADE", "cert_type");
  const hasAddress = Boolean(street && city && state);
  const optedOut = !hasAddress && Boolean(firstName || lastName);

  return {
    id: `p_faa_airmen_${slugify(fullName)}_${slugify(recordId)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      cert ? `Airman certificate: ${cert}` : "",
      optedOut ? "Address withheld (airman opt-out)" : "",
    ].filter(Boolean),
    locations: hasAddress
      ? [
          {
            city,
            state,
            street,
            zip,
            kind: "FAA airman mailing address",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: row,
    },
  };
}

function pick(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim()) {
      return value.trim();
    }
    const lower = row[key.toLowerCase()];
    if (lower && lower.trim()) {
      return lower.trim();
    }
  }
  return "";
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}
