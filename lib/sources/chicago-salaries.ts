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
 * Chicago Data Portal — "Current Employee Names, Salaries, and Position Titles"
 * (https://data.cityofchicago.org/resource/xzkq-xp2w.json) via the Socrata SODA
 * JSON API. Public, no key. Searches City of Chicago employees by name and
 * creates one context profile per matching employee, preserving the public
 * payroll record (name, department, job title) as a source record. Public-record
 * employment context only, not residential or identity-verification evidence.
 */

const sourceId = "chicago_current_employee_salaries";
const DATASET_ID = "xzkq-xp2w";
const CHICAGO_SALARY_URL = `https://data.cityofchicago.org/resource/${DATASET_ID}.json`;

export type ChicagoSalariesIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type ChicagoSalariesIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestChicagoSalaries(
  input: ChicagoSalariesIngestInput,
): Promise<ChicagoSalariesIngestResult> {
  registerChicagoSalariesSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: CHICAGO_SALARY_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildSalariesUrl({ first, last, limit });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchChicagoSalariesIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Chicago employee salaries request failed: ${response.status} ${response.statusText}`,
    );
  }

  const records = (await response.json()) as ChicagoSalaryRecord[];
  const limited = applyImportLimit(records, limit);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByEmployee = new Map<string, UpsertProfileInput>();
  for (const record of limited) {
    const fullName = employeeFullName(record);
    if (!fullName) {
      continue;
    }
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(fullName, requiredTokens)
    ) {
      continue;
    }
    const key = dedupKey(fullName, record);
    if (profilesByEmployee.has(key)) {
      continue;
    }
    const profile = mapChicagoSalaryRecordToProfileInput(record, fullName);
    if (profile) {
      profilesByEmployee.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByEmployee.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: limited.length, imported, url };
}

export function registerChicagoSalariesSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Chicago Current Employee Names, Salaries, and Position Titles",
    category: "Public payroll record",
    jurisdiction: "Chicago, IL",
    acquisitionMethod: "official_api",
    licenseUrl: "https://data.cityofchicago.org/",
    notes:
      "Official City of Chicago Data Portal (Socrata SODA) employee salary dataset. Use as public-payroll employment context only; department and job-title affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapChicagoSalaryRecordToProfileInput(
  record: ChicagoSalaryRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const department = record.department;
  const jobTitle = record.job_titles;

  const aliases = [department, jobTitle].filter(
    (value): value is string => Boolean(value && value.trim()),
  );

  const recordId = `${record.name ?? "employee"}__${normalizeKey(
    fullName,
  )}__${normalizeKey(department ?? "")}`;

  return {
    id: `p_chicagosalary_${normalizeKey(fullName)}__${normalizeKey(
      department ?? "",
    )}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: department
      ? [
          {
            city: department,
            state: "IL",
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

function buildSalariesUrl(input: {
  first: string;
  last: string;
  limit: number | undefined;
}) {
  // The `name` column is formatted "Last, First". Use a SoQL `where` with
  // upper(name) LIKE so the query is selective across the ~30k-row dataset.
  const where = buildNameWhere(input.first, input.last);
  const url = new URL(CHICAGO_SALARY_URL);
  if (where) {
    url.searchParams.set("$where", where);
  }
  url.searchParams.set("$limit", String(input.limit ?? 100));
  return url.toString();
}

function buildNameWhere(first: string, last: string): string {
  const lastToken = sanitizeSoqlToken(last);
  const firstToken = sanitizeSoqlToken(first);
  if (lastToken && firstToken) {
    return `upper(name) like '%${lastToken.toUpperCase()}%${firstToken.toUpperCase()}%'`;
  }
  const token = lastToken || firstToken;
  return token ? `upper(name) like '%${token.toUpperCase()}%'` : "";
}

function sanitizeSoqlToken(value: string): string {
  return value.replace(/['%_\\]/g, "").trim();
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

/**
 * The dataset stores names as "Last, First [M]" — reorder to "First Last" for
 * display and downstream normalization.
 */
function employeeFullName(record: ChicagoSalaryRecord): string {
  const raw = record.name?.trim();
  if (!raw) {
    return "";
  }
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) {
    return raw;
  }
  const last = raw.slice(0, commaIndex).trim();
  const given = raw.slice(commaIndex + 1).trim();
  return `${given} ${last}`.replace(/\s+/g, " ").trim();
}

function dedupKey(fullName: string, record: ChicagoSalaryRecord): string {
  return `${normalizeKey(fullName)}__${normalizeKey(record.department ?? "")}`;
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

export type ChicagoSalaryRecord = {
  /** Stored as "Last, First [Middle]". */
  name?: string;
  job_titles?: string;
  department?: string;
  full_or_part_time?: string;
  salary_or_hourly?: string;
  typical_hours?: string | number;
  annual_salary?: string | number;
  hourly_rate?: string | number;
};
