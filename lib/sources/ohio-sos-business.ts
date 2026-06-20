import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";

export type OhioSosBusinessIngestInput = {
  /** Path to an Ohio SoS business entity/officer CSV from the bulk download. */
  file: string;
  /** Optional person name; when set, only matching agents/officers become profiles. */
  query?: string;
};

export type OhioSosBusinessIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "ohio_sos_business_entities";

// Ohio Secretary of State business data is a bulk download (not a per-query
// API). This adapter parses an entity/officer CSV and creates a profile per
// registered agent or officer name, with the business address as context.
// Business/agent addresses are not residences.
export async function ingestOhioSosBusinessFromFile(
  input: OhioSosBusinessIngestInput,
): Promise<OhioSosBusinessIngestResult> {
  registerOhioSosBusinessSource();

  const csv = readFileSync(input.file, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as OhioSosBusinessRow[];

  const profiles = rows
    .map((row) => mapOhioSosBusinessRowToProfileInput(row, input.query ?? ""))
    .filter((profile): profile is UpsertProfileInput => Boolean(profile));

  for (const profile of profiles) {
    upsertProfile(profile);
  }

  return { fetched: rows.length, imported: profiles.length, url: input.file };
}

export function registerOhioSosBusinessSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Ohio Secretary of State Business Entities",
    category: "State business entity officer/agent",
    jurisdiction: "Ohio",
    acquisitionMethod: "official_bulk",
    licenseUrl: "https://ohiosos.gov/business/business-reports/",
    notes:
      "Ohio SoS business entity bulk data (public record). Use as business officer/registered-agent context only; business/agent address is not a residence.",
  });
}

export type OhioSosBusinessRow = Record<string, string>;

export function mapOhioSosBusinessRowToProfileInput(
  row: OhioSosBusinessRow,
  query: string,
): UpsertProfileInput | null {
  const fullName = cleanName(
    pick(row, "AGENT_NAME", "OFFICER_NAME", "REGISTERED_AGENT_NAME"),
  );
  if (!fullName) {
    return null;
  }
  if (query && !nameMatchesQuery(fullName, query)) {
    return null;
  }

  const businessName = pick(row, "BUSINESS_NAME", "ENTITY_NAME");
  const role = pick(row, "AGENT_TYPE", "OFFICER_TITLE", "OFFICER_TYPE", "TITLE");
  const recordId =
    pick(row, "BUSINESS_NUMBER", "ENTITY_NUMBER", "CHARTER_NUMBER") ||
    `${businessName}:${fullName}`;
  const street = pick(row, "AGENT_ADDRESS1", "ADDRESS1", "STREET");
  const city = pick(row, "AGENT_CITY", "CITY");
  const state = pick(row, "AGENT_STATE", "STATE");
  const zip = pick(row, "AGENT_ZIP", "ZIP");
  const hasAddress = Boolean(city && state);

  return {
    id: `p_ohio_sos_${slugify(fullName)}_${slugify(recordId)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      businessName ? `Ohio business: ${businessName}` : "",
      role ? `Role: ${role}` : "",
    ].filter(Boolean),
    locations: hasAddress
      ? [
          {
            city,
            state,
            street: street || undefined,
            zip: zip || undefined,
            kind: "Ohio business/registered-agent address",
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

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}
