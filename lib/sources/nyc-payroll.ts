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
 * NYC Citywide Payroll Data (Fiscal Year) on NYC Open Data
 * (https://data.cityofnewyork.us/resource/k397-673e.json) — public, no key.
 * Searches the Socrata (SODA) dataset by employee name and creates one context
 * profile per matching employee, preserving the payroll record (agency, title,
 * fiscal year) as a source record. Public-record employment context only, not
 * residential, contact, or identity-verification evidence.
 */

export type NycPayrollIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type NycPayrollIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "nyc_citywide_payroll";
const NYC_PAYROLL_DATASET_ID = "k397-673e";
const NYC_PAYROLL_BASE_URL = `https://data.cityofnewyork.us/resource/${NYC_PAYROLL_DATASET_ID}.json`;

export async function ingestNycPayroll(
  input: NycPayrollIngestInput,
): Promise<NycPayrollIngestResult> {
  registerNycPayrollSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: NYC_PAYROLL_BASE_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildNycPayrollUrl({ first, last, limit });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchNycPayrollIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `NYC Citywide Payroll request failed: ${response.status} ${response.statusText}`,
    );
  }

  const records = (await response.json()) as NycPayrollRecord[];
  const rows = applyImportLimit(records ?? [], limit);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByEmployee = new Map<string, UpsertProfileInput>();
  for (const record of rows) {
    const fullName = nycEmployeeFullName(record);
    if (!fullName) {
      continue;
    }
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(fullName, requiredTokens)
    ) {
      continue;
    }
    const key = `${normalizeKey(fullName)}__${normalizeKey(record.agency_name ?? "")}`;
    if (profilesByEmployee.has(key)) {
      continue;
    }
    const profile = mapNycPayrollRecordToProfileInput(record, fullName);
    if (profile) {
      profilesByEmployee.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByEmployee.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: rows.length, imported, url };
}

export function registerNycPayrollSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "NYC Citywide Payroll Data (Fiscal Year)",
    category: "Public payroll record",
    jurisdiction: "New York City, NY",
    acquisitionMethod: "official_api",
    licenseUrl: "https://data.cityofnewyork.us/d/k397-673e",
    notes:
      "Official NYC Open Data (Socrata SODA) Citywide Payroll dataset. Use as public-record employment context only; agency, title, and fiscal-year affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapNycPayrollRecordToProfileInput(
  record: NycPayrollRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const agency = record.agency_name;
  const title = record.title_description;
  const year = record.fiscal_year;

  const aliases = [
    agency ? `Last known institution: ${agency}` : "",
    title ? `Title: ${title}` : "",
    year ? `Year: ${year}` : "",
  ].filter(Boolean);

  const recordId = `${normalizeKey(fullName)}__${normalizeKey(agency ?? "unknown")}__${year ?? "fy"}`;

  return {
    id: `p_nycpayroll_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: agency
      ? [
          {
            city: agency,
            state: "NY",
            kind: "public payroll affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: { record, matchedEmployee: fullName },
    },
  };
}

function buildNycPayrollUrl(input: {
  first: string;
  last: string;
  limit: number | undefined;
}) {
  const url = new URL(NYC_PAYROLL_BASE_URL);
  const clauses: string[] = [];
  if (input.last) {
    clauses.push(`upper(last_name)='${socrataEscape(input.last.toUpperCase())}'`);
  }
  if (input.first) {
    clauses.push(
      `upper(first_name)='${socrataEscape(input.first.toUpperCase())}'`,
    );
  }
  if (clauses.length > 0) {
    url.searchParams.set("$where", clauses.join(" AND "));
  }
  url.searchParams.set("$order", "fiscal_year DESC");
  if (typeof input.limit === "number") {
    url.searchParams.set("$limit", String(input.limit));
  } else {
    url.searchParams.set("$limit", "100");
  }
  return url.toString();
}

function socrataEscape(value: string) {
  return value.replace(/'/g, "''");
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

function nycEmployeeFullName(record: NycPayrollRecord): string {
  const last = (record.last_name ?? "").trim();
  const first = (record.first_name ?? "").trim();
  const mid = (record.mid_init ?? "").trim();
  const base = `${first} ${mid}`.trim();
  const full = `${base} ${last}`.trim();
  return full;
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

export type NycPayrollRecord = {
  fiscal_year?: string;
  payroll_number?: string;
  agency_name?: string;
  last_name?: string;
  first_name?: string;
  mid_init?: string;
  agency_start_date?: string;
  work_location_borough?: string;
  title_description?: string;
  leave_status_as_of_june_30?: string;
  base_salary?: string;
  pay_basis?: string;
  regular_hours?: string;
  regular_gross_paid?: string;
  ot_hours?: string;
  total_ot_paid?: string;
  total_other_pay?: string;
};
