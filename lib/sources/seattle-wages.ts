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
 * City of Seattle — "City of Seattle Wage Data"
 * (https://data.seattle.gov/resource/2khk-5ukd.json) via the Socrata SODA JSON
 * API. Public, no key. Searches City of Seattle employees by name and creates
 * one context profile per match, preserving the public payroll record
 * (department, job title, hourly wage). Public-record employment context only,
 * not residential or identity-verification evidence.
 */

const sourceId = "seattle_employee_wages";
const DATASET_ID = "2khk-5ukd";
const SEATTLE_WAGE_URL = `https://data.seattle.gov/resource/${DATASET_ID}.json`;

export type SeattleWagesIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type SeattleWagesIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestSeattleWages(
  input: SeattleWagesIngestInput,
): Promise<SeattleWagesIngestResult> {
  registerSeattleWagesSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: SEATTLE_WAGE_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildWageUrl({ first, last, limit });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchSeattleWagesIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Seattle employee wages request failed: ${response.status} ${response.statusText}`,
    );
  }

  const records = (await response.json()) as SeattleWageRecord[];
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
    const profile = mapSeattleWageRecordToProfileInput(record, fullName);
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

export function registerSeattleWagesSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "City of Seattle Wage Data",
    category: "Public payroll record",
    jurisdiction: "Seattle, WA",
    acquisitionMethod: "official_api",
    licenseUrl: "https://data.seattle.gov/",
    notes:
      "Official City of Seattle open data (Socrata SODA) employee wage dataset. Use as public-payroll employment context only; department and job-title affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapSeattleWageRecordToProfileInput(
  record: SeattleWageRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const department = record.department;
  const jobTitle = record.job_title;
  const hourlyRate = cleanHourlyRate(record.hourly_rate);

  const aliases = [
    department,
    jobTitle,
    hourlyRate ? `Hourly wage: $${hourlyRate}` : "",
  ].filter((value): value is string => Boolean(value && value.trim()));

  const recordId = `${normalizeKey(fullName)}__${normalizeKey(
    department ?? "",
  )}`;

  return {
    id: `p_seattlewage_${normalizeKey(fullName)}__${normalizeKey(
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
            state: "WA",
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

function buildWageUrl(input: {
  first: string;
  last: string;
  limit: number | undefined;
}) {
  const where = buildNameWhere(input.first, input.last);
  const url = new URL(SEATTLE_WAGE_URL);
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
    return `upper(last_name) like '%${lastToken.toUpperCase()}%' AND upper(first_name) like '%${firstToken.toUpperCase()}%'`;
  }
  if (lastToken) {
    return `upper(last_name) like '%${lastToken.toUpperCase()}%'`;
  }
  return firstToken
    ? `upper(first_name) like '%${firstToken.toUpperCase()}%'`
    : "";
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

/** Seattle stores first/last separately — join for display. */
function employeeFullName(record: SeattleWageRecord): string {
  return [record.first_name, record.last_name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function dedupKey(fullName: string, record: SeattleWageRecord): string {
  return `${normalizeKey(fullName)}__${normalizeKey(record.department ?? "")}`;
}

function cleanHourlyRate(value: SeattleWageRecord["hourly_rate"]): string {
  if (value == null || value === "") {
    return "";
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(2);
  }
  return String(value).trim();
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

export type SeattleWageRecord = {
  first_name?: string;
  last_name?: string;
  department?: string;
  job_title?: string;
  hourly_rate?: string | number;
};
