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
 * University of California Annual Wage disclosure
 * (https://ucannualwage.ucop.edu/wage/) — the official UC Office of the
 * President (UCOP) public-payroll portal. Public, no key. The portal is a
 * jQuery front-end that POSTs a JSON query to `/wage/search` and receives a
 * JSON `{ rows, records, ... }` payload searchable by first/last name, campus
 * ("location"), job title, and calendar year. This adapter queries that
 * endpoint by employee name and creates one context profile per matching
 * employee (deduped by normalized name + campus), preserving the public payroll
 * record (campus, job title, calendar year, pay fields) as a source record.
 * Public-record employment context only, not residential, contact, or
 * identity-verification evidence.
 */

export type UcAnnualWageIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  /** Calendar year to search (e.g. "2024"). Defaults to the most recent year. */
  year?: string;
  limit?: number;
};

export type UcAnnualWageIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "uc_annual_wage";
const UC_WAGE_SEARCH_URL = "https://ucannualwage.ucop.edu/wage/search";
const UC_WAGE_SITE_URL = "https://ucannualwage.ucop.edu/wage/";
/** Most recent disclosure year the portal offers as of implementation. */
const DEFAULT_YEAR = "2024";

export async function ingestUcAnnualWage(
  input: UcAnnualWageIngestInput,
): Promise<UcAnnualWageIngestResult> {
  registerUcAnnualWageSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: UC_WAGE_SITE_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const year = (input.year ?? "").trim() || DEFAULT_YEAR;
  const payload = buildSearchPayload({ first, last, year });
  const response = await fetch(UC_WAGE_SEARCH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "PeopleSearchUcAnnualWageIngest/0.1 local-development",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `UC annual wage request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as UcWageSearchResponse;
  const rows = applyImportLimit(data.rows ?? [], limit);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByEmployee = new Map<string, UpsertProfileInput>();
  for (const record of rows) {
    const fullName = ucEmployeeFullName(record);
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
    const profile = mapUcWageRecordToProfileInput(record, fullName);
    if (profile) {
      profilesByEmployee.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByEmployee.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: rows.length, imported, url: UC_WAGE_SITE_URL };
}

export function registerUcAnnualWageSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "University of California Annual Wage (UC Employee Pay)",
    category: "Public payroll record",
    jurisdiction: "California (University of California)",
    acquisitionMethod: "official_api",
    licenseUrl: UC_WAGE_SITE_URL,
    notes:
      "Official UC Office of the President (UCOP) Annual Wage disclosure portal. Searches the /wage/search JSON endpoint by employee name. Use as public-record employment context only; campus affiliation and job title are not residential, contact, or identity-verification evidence.",
  });
}

export function mapUcWageRecordToProfileInput(
  record: UcWageRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const campus = record.location;
  const title = record.title;
  const year = record.year;

  const aliases = [
    campus ? `Last known institution: UC ${campus}` : "",
    title ? `Title: ${title}` : "",
    year ? `Year: ${year}` : "",
  ].filter(Boolean);

  const recordId = `${normalizeKey(fullName)}__${normalizeKey(
    campus ?? "unknown",
  )}__${year ?? "fy"}`;

  return {
    id: `p_ucwage_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: campus
      ? [
          {
            city: `UC ${campus}`,
            state: "CA",
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

function buildSearchPayload(input: {
  first: string;
  last: string;
  year: string;
}): UcWageSearchRequest {
  return {
    op: "search",
    page: 1,
    // Request a generous page so a name search returns its full result set in a
    // single round-trip; the portal otherwise caps pageSize near 20.
    rows: 100,
    sidx: "name",
    sord: "asc",
    count: 0,
    year: input.year,
    location: "ALL",
    firstname: input.first,
    lastname: input.last,
    title: "",
    startSal: "",
    endSal: "",
  };
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

function ucEmployeeFullName(record: UcWageRecord): string {
  const first = (record.firstname ?? "").trim();
  const last = (record.lastname ?? "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function dedupKey(fullName: string, record: UcWageRecord): string {
  return `${normalizeKey(fullName)}__${normalizeKey(record.location ?? "")}`;
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

export type UcWageRecord = {
  id?: number;
  year?: string;
  /** Campus / employer location code (e.g. "Berkeley", "Los Angeles", "UCOP"). */
  location?: string;
  firstname?: string;
  lastname?: string;
  /** Job title code (e.g. "PROF-AY", "SRA 2"). */
  title?: string;
  grosspay?: string;
  basepay?: string;
  overtimepay?: string;
  adjustpay?: string;
};

type UcWageSearchRequest = {
  op: string;
  page: number;
  rows: number;
  sidx: string;
  sord: string;
  count: number;
  year: string;
  location: string;
  firstname: string;
  lastname: string;
  title: string;
  startSal: string;
  endSal: string;
};

type UcWageSearchResponse = {
  op?: string;
  records?: number;
  page?: number;
  total?: number;
  pageSize?: number;
  rows?: UcWageRecord[];
};
