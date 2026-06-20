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
 * DOJ FARA (Foreign Agents Registration Act) — efile.fara.gov public ORDS API,
 * no key. Searches registrant filings by firm/individual name and creates one
 * context profile per matching individual (registrant or short-form officer),
 * preserving the registrant firm + role as a source record. Foreign-agent
 * registration context only, not residential, contact, or identity-verification
 * evidence.
 *
 * Two endpoint tiers are used:
 *   1. /api/v1/Registrants/json/{Active|Terminated} — full registrant roster
 *      (firm or individual name, registration number/date). No name filter on
 *      the server, so the roster is fetched and filtered client-side by name.
 *   2. /api/v1/ShortFormRegistrants/json/{Active|Terminated}/<regNumber> — the
 *      individual officers (SF_FIRST_NAME / SF_LAST_NAME) filed under a firm's
 *      registration, fetched per matched registration number.
 *
 * The API throttles to 5 requests / 10s, so each sub-request is spaced out.
 */

export type DojFaraIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type DojFaraIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "doj_fara_registrants";
const FARA_BASE_URL = "https://efile.fara.gov";
const FARA_REGISTRANTS_URL = `${FARA_BASE_URL}/api/v1/Registrants/json`;
const FARA_SHORTFORM_URL = `${FARA_BASE_URL}/api/v1/ShortFormRegistrants/json`;
const USER_AGENT = "PeopleSearchDojFaraIngest/0.1 local-development";
/** API allows 5 requests / 10s. Space requests to stay well under the limit. */
const INTER_REQUEST_DELAY_MS = 2500;

export async function ingestDojFaraRegistrants(
  input: DojFaraIngestInput,
): Promise<DojFaraIngestResult> {
  registerDojFaraSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: FARA_REGISTRANTS_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  // Fetch both active + terminated rosters. Roster names are firms or
  // "Last, First" individuals; we match against the supplied tokens.
  const statuses: FaraStatus[] = ["Active", "Terminated"];
  const matchedRegistrants: FaraRegistrant[] = [];
  for (let i = 0; i < statuses.length; i += 1) {
    if (i > 0) {
      await sleep(INTER_REQUEST_DELAY_MS);
    }
    const status = statuses[i];
    const roster = await fetchRegistrantRoster(status);
    for (const registrant of roster) {
      const name = registrant.Name ?? "";
      if (!name) {
        continue;
      }
      // Normalize "Last, First" to "First Last" for token matching.
      const comparable = reorderLastFirst(name);
      if (
        requiredTokens.length > 0 &&
        !normalizedNameMatchesTokens(comparable, requiredTokens)
      ) {
        continue;
      }
      matchedRegistrants.push({ ...registrant, status });
    }
  }

  const limited = applyImportLimit(matchedRegistrants, limit);

  // One profile per individual. For firm registrations, enumerate the officers
  // via the short-form endpoint; for individual registrations, use the
  // registrant name itself. Dedup by normalized name + firm.
  const profilesByKey = new Map<string, UpsertProfileInput>();
  for (let i = 0; i < limited.length; i += 1) {
    if (i > 0) {
      await sleep(INTER_REQUEST_DELAY_MS);
    }
    const registrant = limited[i];
    const officers = await fetchShortFormOfficers(
      registrant.status,
      registrant.Registration_Number,
    );
    const firmName = registrant.Name;

    if (officers.length > 0) {
      for (const officer of officers) {
        const fullName = `${officer.SF_FIRST_NAME ?? ""} ${
          officer.SF_LAST_NAME ?? ""
        }`.trim();
        if (!fullName) {
          continue;
        }
        if (
          requiredTokens.length > 0 &&
          !normalizedNameMatchesTokens(fullName, requiredTokens)
        ) {
          continue;
        }
        const profile = mapDojFaraRecordToProfileInput(
          {
            registrationNumber: registrant.Registration_Number,
            registrantName: firmName,
            date: officer.SHORTFORM_DATE ?? registrant.Registration_Date,
            role: "short-form registrant officer",
          },
          fullName,
        );
        addProfile(profilesByKey, profile, firmName);
      }
    } else if (looksLikeIndividualName(firmName)) {
      // Individual registrant (no separate firm). Treat the registrant name as
      // the person and the role as the registrant of record.
      const fullName = reorderLastFirst(firmName);
      const profile = mapDojFaraRecordToProfileInput(
        {
          registrationNumber: registrant.Registration_Number,
          registrantName: firmName,
          date: registrant.Registration_Date,
          role: "foreign agent registrant",
        },
        fullName,
      );
      addProfile(profilesByKey, profile, firmName);
    }
  }

  let imported = 0;
  for (const profile of profilesByKey.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: limited.length,
    imported,
    url: FARA_REGISTRANTS_URL,
  };
}

export function registerDojFaraSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "DOJ FARA Foreign Agent Registrants",
    category: "Foreign agent registration mention",
    jurisdiction: "US",
    acquisitionMethod: "official_api",
    licenseUrl: "https://efile.fara.gov/ords/fara/r/fara_ws/api/endpoints",
    notes:
      "Official DOJ FARA eFile ORDS API (efile.fara.gov), no key. Use as foreign-agent registration context only; registrant firm and foreign-principal affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapDojFaraRecordToProfileInput(
  record: FaraProfileRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const firm = record.registrantName;
  const role = record.role;
  const year = yearFromDate(record.date);

  const aliases = [
    firm ? `FARA registrant firm: ${firm}` : "",
    role ? `Role: ${role}` : "",
    year ? `Filing year: ${year}` : "",
  ].filter(Boolean);

  const recordId = `${
    record.registrationNumber ?? "fara"
  }__${normalizeKey(fullName)}`;

  return {
    id: `p_farareg_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: firm
      ? [
          {
            city: firm,
            state: "US",
            kind: "foreign-agent filing affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: { record, matchedRegistrant: firm ?? fullName },
    },
  };
}

// --- HTTP helpers -----------------------------------------------------------

type FaraStatus = "Active" | "Terminated";

type FaraRegistrant = {
  Name?: string;
  Address_1?: string;
  City?: string;
  State?: string;
  Zip?: string | number;
  Registration_Number?: string | number;
  Registration_Date?: string;
  status?: FaraStatus;
};

type FaraShortFormOfficer = {
  REG_NUMBER?: string | number;
  REGISTRANT_NAME?: string;
  SF_FIRST_NAME?: string;
  SF_LAST_NAME?: string;
  SHORTFORM_DATE?: string;
  REG_DATE?: string;
  ADDRESS_1?: string;
  CITY?: string;
  STATE?: string;
};

export type FaraProfileRecord = {
  registrationNumber?: string | number;
  registrantName?: string;
  date?: string;
  role?: string;
};

async function fetchRegistrantRoster(
  status: FaraStatus,
): Promise<FaraRegistrant[]> {
  const url = `${FARA_REGISTRANTS_URL}/${status}`;
  const payload = (await fetchJson(url)) as
    | { REGISTRANTS_ACTIVE?: { ROW?: FaraRegistrant[] } }
    | { REGISTRANTS_TERMINATED?: { ROW?: FaraRegistrant[] } };

  if (status === "Active") {
    return (payload as { REGISTRANTS_ACTIVE?: { ROW?: FaraRegistrant[] } })
      .REGISTRANTS_ACTIVE?.ROW ?? [];
  }
  return (payload as { REGISTRANTS_TERMINATED?: { ROW?: FaraRegistrant[] } })
    .REGISTRANTS_TERMINATED?.ROW ?? [];
}

async function fetchShortFormOfficers(
  status: FaraStatus | undefined,
  registrationNumber: string | number | undefined,
): Promise<FaraShortFormOfficer[]> {
  if (registrationNumber == null || registrationNumber === "") {
    return [];
  }
  const resolved: FaraStatus = status ?? "Active";
  const url = `${FARA_SHORTFORM_URL}/${resolved}/${registrationNumber}`;
  // The short-form endpoint returns 404 for registrations that simply have no
  // short-form filings on record — that is a normal "no officers" state, not a
  // hard failure, so degrade to an empty list rather than aborting the import.
  const payload = (await fetchJsonOptional(url)) as
    | { ROWSET?: "" | { ROW?: FaraShortFormOfficer[] } }
    | { ROWSET?: "" | { ROW?: FaraShortFormOfficer } }
    | null;
  if (!payload) {
    return [];
  }
  const rowset = payload.ROWSET;
  if (!rowset || typeof rowset !== "object") {
    return [];
  }
  const row = rowset.ROW;
  if (!row) {
    return [];
  }
  return Array.isArray(row) ? row : [row];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `DOJ FARA request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }
  // The API encodes payloads as iso-8859-1 per its documentation.
  return parseFaraJson(await response.text());
}

/**
 * Like fetchJson but returns null for 4xx responses (which the FARA API uses
 * to signal "no data on record" for some per-registration endpoints).
 */
async function fetchJsonOptional(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
    },
    cache: "no-store",
  });
  if (response.status >= 400 && response.status < 500) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `DOJ FARA request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return parseFaraJson(await response.text());
}

function parseFaraJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Some error bodies come back as a JS-ish object
    // (`{ Success: false, ... }`). Surface those rather than crashing.
    throw new Error(`DOJ FARA response was not valid JSON: ${text.slice(0, 120)}`);
  }
}

// --- Utilities --------------------------------------------------------------

function addProfile(
  store: Map<string, UpsertProfileInput>,
  profile: UpsertProfileInput | null,
  firmName: string | undefined,
) {
  if (!profile) {
    return;
  }
  const key = `${normalizeKey(profile.fullName)}__${normalizeKey(firmName ?? "")}`;
  if (store.has(key)) {
    return;
  }
  store.set(key, profile);
}

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

function reorderLastFirst(value: string | undefined): string {
  // FARA individual names are "Last, First" / "Last, First Middle".
  const subject = value ?? "";
  const match = subject.match(/^([^,]+),\s*(.+)$/);
  if (!match) {
    return subject;
  }
  return `${match[2].trim()} ${match[1].trim()}`.trim();
}

function looksLikeIndividualName(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  // Firm markers strongly suggest an organization rather than a person.
  const firmMarkers =
    /\b(inc|llc|llp|lp|plc|corp|corporation|company|co\.|ltd|associates|group|partners|law| LLP| PLLC)\b/i;
  if (firmMarkers.test(value)) {
    return false;
  }
  return value.includes(",");
}

function yearFromDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = String(value).match(/(\d{4})/);
  return match ? match[1] : undefined;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
