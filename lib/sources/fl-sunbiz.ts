import { spawnSync } from "node:child_process";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import {
  normalizedNameMatchesTokens,
  tokenizeName,
} from "@/lib/name-search";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

/**
 * Florida Division of Corporations (Sunbiz) — public, no key. Searches business
 * officers / authorized members by name and creates one context profile per
 * matching individual, preserving the business entity, title/role, and status.
 *
 * Data path: the interactive `search.sunbiz.org` officer/entity search is gated
 * by a Cloudflare JS challenge (no clean JSON/CSV over HTTP). Instead this
 * adapter uses the OFFICIAL public bulk data the Florida Department of State
 * publishes via documented public SFTP access:
 *   - Host: sftp.floridados.gov  User: Public  Password: PubAccess1845!
 *   - Published at https://dos.fl.gov/sunbiz/other-services/data-downloads/
 * The "Corporate Data" daily files (`/Public/doc/cor/yyyymmddc.txt`) are
 * fixed-length ASCII records (1440 chars) defined at
 * https://dos.sunbiz.org/data-definitions/cor.html and contain up to six
 * officers per entity (Title, Type, Name, Address, City, State, Zip). This is
 * the same officer data Sunbiz displays. Public business-registry context only,
 * not residential, contact, or identity-verification evidence. Officer street
 * addresses in the bulk file are intentionally NOT mapped (residential).
 *
 * The adapter reads the most recent available corporate daily file, parses its
 * fixed-length records, and matches officer names against the query. The SFTP
 * fetch is performed by shelling out to the system `lftp` client (the Florida
 * host rejects non-interactive password auth over plain `sftp`, but lftp
 * performs the documented public-password login), so neither a registration,
 * payment, nor a private API key is required.
 */

export type FlSunbizIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type FlSunbizIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "fl_sunbiz_business_entities";
const SFTP_URL = "sftp://sftp.floridados.gov";
const DATA_DOWNLOADS_URL =
  "https://dos.fl.gov/sunbiz/other-services/data-downloads/";
const COR_FIELD_DEFS_URL = "https://dos.sunbiz.org/data-definitions/cor.html";
const SFTP_HOST = "sftp.floridados.gov";
const SFTP_USER = "Public";
const SFTP_PASSWORD = "PubAccess1845!";
const COR_DIR = "doc/cor";
/** Number of recent weekdays to probe for a corporate daily file (skips holidays). */
const MAX_DATE_PROBE = 10;

export async function ingestFlSunbiz(
  input: FlSunbizIngestInput,
): Promise<FlSunbizIngestResult> {
  registerFlSunbizSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: SFTP_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const fileText = await fetchLatestCorporateFile();
  if (!fileText) {
    return { fetched: 0, imported: 0, url: SFTP_URL };
  }

  const records = parseCorporateRecords(fileText);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByKey = new Map<string, UpsertProfileInput>();
  let matched = 0;
  for (const record of records) {
    for (const officer of record.officers) {
      const fullName = officer.displayName;
      if (!fullName) {
        continue;
      }
      if (
        requiredTokens.length > 0 &&
        !normalizedNameMatchesTokens(fullName, requiredTokens)
      ) {
        continue;
      }
      matched += 1;
      const dedupKey = `${normalizeKey(fullName)}__${normalizeKey(
        record.corporationName,
      )}`;
      if (profilesByKey.has(dedupKey)) {
        continue;
      }
      const profile = mapFlSunbizOfficerToProfileInput(
        officer,
        record,
        fullName,
      );
      if (profile) {
        profilesByKey.set(dedupKey, profile);
      }
    }
  }

  const limited = applyImportLimit(
    Array.from(profilesByKey.values()),
    limit,
  );
  for (const profile of limited) {
    upsertProfile(profile);
  }

  return {
    fetched: matched,
    imported: limited.length,
    url: SFTP_URL,
  };
}

export function registerFlSunbizSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Florida Division of Corporations (Sunbiz) Officer Search",
    category: "Business entity officer mention",
    jurisdiction: "Florida",
    acquisitionMethod: "official_bulk_file",
    licenseUrl: DATA_DOWNLOADS_URL,
    notes:
      "Official Florida Division of Corporations public bulk data (Sunbiz) via documented public SFTP access (sftp.floridados.gov, user Public). Corporate daily files contain officer/authorized-member names, titles, and entity affiliation. Use as public business-registry context only; entity affiliation and officer role are NOT residential, contact, or identity-verification evidence. Officer street addresses in the source file are intentionally not imported.",
  });
}

export type FlSunbizOfficer = {
  /** Display name in "First [Middle] Last" order. */
  displayName: string;
  /** Raw last-name-first name as stored in the file. */
  rawName: string;
  /** Raw title code(s) as stored, e.g. "MGR", "AP", "P". */
  rawTitle: string;
  /** Decoded human-readable title/role, e.g. "Manager", "Authorized Member". */
  title: string;
  /** 1-based officer slot (1-6). */
  slot: number;
};

export type FlSunbizEntity = {
  corporationNumber: string;
  corporationName: string;
  status: string;
  filingType: string;
  fileDate?: string;
  officers: FlSunbizOfficer[];
};

export function mapFlSunbizOfficerToProfileInput(
  officer: FlSunbizOfficer,
  entity: FlSunbizEntity,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const entityName = entity.corporationName;
  const title = officer.title;
  const status = decodeStatus(entity.status);

  const aliases = [
    entityName ? `Last known institution: ${entityName}` : "",
    title ? `Title: ${title}` : "",
    status ? `Status: ${status}` : "",
  ].filter(Boolean);

  const recordId = `${normalizeKey(entityName || entity.corporationNumber || "entity")}__${normalizeKey(fullName)}`;

  return {
    id: `p_sunbiz_${recordId}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: entityName
      ? [
          {
            city: entityName,
            state: "FL",
            kind: "business registry affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: { officer, entity, matchedOfficer: fullName },
    },
  };
}

// --- Corporate fixed-length record parsing (cor.html field definitions) ---

const FIELD = {
  CORPORATION_NUMBER: [1, 12],
  CORPORATION_NAME: [13, 192],
  STATUS: [205, 1],
  FILING_TYPE: [206, 15],
  FILE_DATE: [473, 8],
  // Officer blocks start at position 669; each officer occupies 128 chars
  // (title 4, type 1, name 42, address 42, city 28, state 2, zip 9).
  OFFICER_TITLE: 669,
} as const;

const OFFICER_BLOCK_LENGTH = 128;
const OFFICER_COUNT = 6;
const CORPORATE_RECORD_LENGTH = 1440;

function parseCorporateRecords(text: string): FlSunbizEntity[] {
  const records: FlSunbizEntity[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length < FIELD.OFFICER_TITLE) {
      continue;
    }
    const record = parseCorporateRecord(line);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function parseCorporateRecord(line: string): FlSunbizEntity | null {
  if (line.length < CORPORATE_RECORD_LENGTH - OFFICER_BLOCK_LENGTH) {
    // Records are nominally 1440 chars, but trailing short records may exist;
    // require at least the first officer block to be present.
    return null;
  }
  const corporationNumber = sliceField(line, ...FIELD.CORPORATION_NUMBER);
  const corporationName = sliceField(line, ...FIELD.CORPORATION_NAME);
  if (!corporationName) {
    return null;
  }

  const officers: FlSunbizOfficer[] = [];
  for (let slot = 1; slot <= OFFICER_COUNT; slot += 1) {
    const base = FIELD.OFFICER_TITLE + (slot - 1) * OFFICER_BLOCK_LENGTH;
    const rawTitle = sliceField(line, base, 4).trim();
    const rawName = sliceField(line, base + 5, 42).trim();
    if (!rawName) {
      continue;
    }
    const displayName = normalizeOfficerName(rawName);
    if (!displayName) {
      continue;
    }
    officers.push({
      displayName,
      rawName,
      rawTitle,
      title: decodeTitle(rawTitle),
      slot,
    });
  }

  return {
    corporationNumber,
    corporationName,
    status: sliceField(line, ...FIELD.STATUS),
    filingType: sliceField(line, ...FIELD.FILING_TYPE).trim(),
    fileDate: sliceField(line, ...FIELD.FILE_DATE).trim() || undefined,
    officers,
  };
}

function sliceField(line: string, start: number, length: number): string {
  // Field start positions in the cor.html definition are 1-based.
  return line.slice(start - 1, start - 1 + length).trim();
}

/**
 * Sunbiz stores officer names LAST-name-first (e.g. "JONES MARY ELLEN",
 * "JIMENEZ STEPHANIE"). Convert to "First [Middle...] Last" display order.
 * Single-token names are returned as-is.
 */
export function normalizeOfficerName(rawName: string): string {
  const cleaned = rawName.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length <= 1) {
    return titleCaseName(cleaned);
  }
  const [last, ...given] = tokens;
  const first = given.join(" ");
  return titleCaseName(`${first} ${last}`.trim());
}

function titleCaseName(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 1) {
        return part.toUpperCase();
      }
      // Preserve all-caps suffixes like "JR", "III" only if fully non-alpha —
      // otherwise title-case to recover given names from the all-caps file.
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Decode Sunbiz officer title codes per cor.html. */
export function decodeTitle(rawTitle: string): string {
  const code = rawTitle.trim().toUpperCase();
  if (!code) {
    return "";
  }
  // Multi-letter LLC/manager-style codes first (exact match).
  const exact: Record<string, string> = {
    MGR: "Manager",
    AMBR: "Authorized Member",
    MRS: "Managing Member",
    AP: "Authorized Member",
    // Single-letter corporate officer codes from cor.html:
    P: "President",
    T: "Treasurer",
    C: "Chairman",
    V: "Vice President",
    S: "Secretary",
    D: "Director",
  };
  if (exact[code]) {
    return exact[code];
  }
  // Fall back to the raw code if unrecognized.
  return code;
}

/** Decode entity status code ("A" = Active, etc.) per Sunbiz conventions. */
export function decodeStatus(rawStatus: string): string {
  const code = rawStatus.trim().toUpperCase();
  const map: Record<string, string> = {
    A: "Active",
    I: "Inactive",
    "": "",
  };
  return code in map ? map[code] : code;
}

// --- SFTP fetch of the most recent corporate daily file ---

async function fetchLatestCorporateFile(): Promise<string | null> {
  const dates = recentWeekdays(MAX_DATE_PROBE);
  for (const date of dates) {
    const remotePath = `${COR_DIR}/${date}c.txt`;
    const text = fetchCorporateFileText(remotePath);
    if (text) {
      return text;
    }
  }
  return null;
}

function fetchCorporateFileText(remotePath: string): string | null {
  // The Florida host rejects non-interactive password auth over plain `sftp`
  // (sshpass+sftp fails with "Permission denied (publickey,password)"), but
  // `lftp` performs the documented public-password SFTP login correctly.
  // Host key is auto-confirmed (public data endpoint). Output via stdout.
  const result = spawnSync(
    "lftp",
    [
      "-c",
      `set sftp:auto-confirm yes; open -u ${SFTP_USER},${SFTP_PASSWORD} sftp://${SFTP_HOST}; cat ${remotePath}; bye`,
    ],
    {
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0 || !result.stdout) {
    return null;
  }
  return result.stdout;
}

function recentWeekdays(count: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  let added = 0;
  let guarded = 0;
  while (added < count && guarded < count + 4) {
    guarded += 1;
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(formatDate(d));
      added += 1;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return dates;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// --- Shared helpers (mirror nih-reporter / nsf-award-search) ---

function splitQuery(query: string | undefined): { first: string; last: string } {
  const tokens = tokenizeName(query ?? "");
  if (tokens.length === 0) {
    return { first: "", last: "" };
  }
  if (tokens.length === 1) {
    return { first: "", last: tokens[0] };
  }
  return { first: tokens[0], last: tokens.slice(1).join(" ") };
}

function normalizeKey(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function uniqueTokens(value: string): string[] {
  return Array.from(new Set(tokenizeName(value)));
}

export { COR_FIELD_DEFS_URL };
