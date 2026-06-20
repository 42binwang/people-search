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
 * Empire Center SeeThroughNY — New York Payrolls
 * (https://www.seethroughny.net/payrolls). Public, no key. The site exposes a
 * structured JSON search endpoint (`/tools/required/reports/payroll?action=get`)
 * that the in-page UI itself calls. It accepts a `WholeName` (substring) query
 * plus `PayYear[]` filters and returns a JSON document whose `html` field holds
 * the result rows as table markup (name, employer/agency, title, pay year,
 * branch). The endpoint only requires a `Referer` pointing at the public
 * payrolls page; there is no auth, registration, API key, or CSRF token.
 *
 * Searches NY State / local government, public-authority, and school payroll
 * records by employee name and creates one context profile per matching
 * employee (dedup by normalized name + employer), preserving the public payroll
 * record as a source record. Public-record employment context only — employer,
 * title, and branch affiliation are not residential, contact, or
 * identity-verification evidence. No residential address is imported.
 */

export type SeeThroughNyPayrollsIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type SeeThroughNyPayrollsIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "seethroughny_payrolls";
const SEETHROUGHNY_PAYROLLS_PAGE = "https://www.seethroughny.net/payrolls";
const SEETHROUGHNY_PAYROLLS_ENDPOINT =
  "https://www.seethroughny.net/tools/required/reports/payroll?action=get";
/** Page size observed from the live endpoint; used to bound paging. */
const RESULTS_PER_PAGE = 200;
/** Cap total rows pulled per ingest to keep name searches bounded. */
const MAX_ROWS = 1000;

export async function ingestSeeThroughNyPayrolls(
  input: SeeThroughNyPayrollsIngestInput,
): Promise<SeeThroughNyPayrollsIngestResult> {
  registerSeeThroughNyPayrollsSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: SEETHROUGHNY_PAYROLLS_ENDPOINT };
  }

  const limit = clampLimit(input.limit, 100);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  // SeeThroughNY WholeName is a substring match across the whole name, so we
  // prefer the most specific token (last name) to keep the candidate set small
  // and then confirm a full-name match client-side.
  const searchName = [last, first].filter(Boolean).join(" ").trim() || last;

  const rows = await fetchAllRows(searchName, limit ?? MAX_ROWS);
  const limited = applyImportLimit(rows, limit);

  const profilesByEmployee = new Map<string, UpsertProfileInput>();
  for (const row of limited) {
    const fullName = row.name;
    if (!fullName) {
      continue;
    }
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(fullName, requiredTokens)
    ) {
      continue;
    }
    const key = dedupKey(fullName, row);
    if (profilesByEmployee.has(key)) {
      continue;
    }
    const profile = mapSeeThroughNyRecordToProfileInput(row, fullName);
    if (profile) {
      profilesByEmployee.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByEmployee.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: limited.length, imported, url: SEETHROUGHNY_PAYROLLS_ENDPOINT };
}

export function registerSeeThroughNyPayrollsSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "SeeThroughNY New York Payrolls",
    category: "Public payroll record",
    jurisdiction: "New York State",
    acquisitionMethod: "official_api",
    licenseUrl: SEETHROUGHNY_PAYROLLS_PAGE,
    notes:
      "Empire Center for Public Policy SeeThroughNY payroll database covering NYS government, public authorities, schools, and local governments. The public in-page JSON search endpoint is used; no key or auth is required. Use as public-record employment context only; employer, title, and branch affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapSeeThroughNyRecordToProfileInput(
  record: SeeThroughNyPayrollRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const employer = record.employer;
  const title = record.title;
  const year = record.payYear;
  const branch = record.branch;

  const aliases = [
    employer ? `Last known institution: ${employer}` : "",
    title ? `Title: ${title}` : "",
    year ? `Year: ${year}` : "",
    branch ? `Branch: ${branch}` : "",
  ].filter(Boolean);

  const recordId = `${normalizeKey(fullName)}__${normalizeKey(
    employer ?? "unknown",
  )}__${normalizeKey(record.rowId ?? "row")}`;

  return {
    id: `p_seethroughny_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: employer
      ? [
          {
            city: employer,
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

type SeeThroughNySearchResponse = {
  html?: string;
  total_records?: string | number;
  total_pages?: number;
  current_page?: number | null;
  result_id?: string | number;
};

async function fetchAllRows(
  wholeName: string,
  maxRows: number,
): Promise<SeeThroughNyPayrollRecord[]> {
  const collected: SeeThroughNyPayrollRecord[] = [];
  let currentPage = 0;
  let resultId: string | number | undefined;

  for (;;) {
    const body = new URLSearchParams();
    body.set("WholeName", wholeName);
    // Default the latest year so the candidate set stays bounded. We keep the
    // most recent pay year as returned by the site (current at time of call).
    body.append("PayYear[]", String(latestPayYear()));
    if (currentPage > 0) {
      body.set("current_page", String(currentPage));
      if (resultId !== undefined) {
        body.set("result_id", String(resultId));
      }
    }

    const response = await fetch(SEETHROUGHNY_PAYROLLS_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        referer: SEETHROUGHNY_PAYROLLS_PAGE,
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "PeopleSearchSeeThroughNyPayrollsIngest/0.1 local-development",
      },
      body: body.toString(),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `SeeThroughNY payroll request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as SeeThroughNySearchResponse;
    const rows = parseResultRows(payload.html ?? "");
    resultId = payload.result_id;
    const totalPages = Number(payload.total_pages ?? 0) || 0;

    for (const row of rows) {
      collected.push(row);
      if (collected.length >= maxRows) {
        return collected.slice(0, maxRows);
      }
    }

    currentPage += 1;
    if (currentPage >= totalPages || rows.length === 0) {
      break;
    }
    if (currentPage * RESULTS_PER_PAGE >= MAX_ROWS) {
      break;
    }
  }

  return collected;
}

/**
 * The SeeThroughNY JSON response carries result rows as table markup in its
 * `html` field. Each employee is a `resultRow{id}` row (with the name and
 * employer in fixed column positions) followed by a hidden `expandRow{id}`
 * detail row whose labeled cells carry Title, Pay Year, and Branch. We pair
 * them by id and extract the labeled detail values rather than relying on
 * positional parsing of the detail markup.
 */
export function parseResultRows(html: string): SeeThroughNyPayrollRecord[] {
  const records: SeeThroughNyPayrollRecord[] = [];
  const details = extractDetailMap(html);

  const mainRowRe =
    /<tr\b[^>]*id="resultRow(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = mainRowRe.exec(html)) !== null) {
    const rowId = match[1];
    const inner = match[2];
    const cells = stripTagsFromCells(inner);
    // Column order: [expander icon, Name, Employer/Agency, Total Pay, SubAgency/Type (hidden)]
    const name = cells[1]?.trim();
    const employer = cells[2]?.trim();
    const totalPay = cells[3]?.trim();
    const subAgency = cells[4]?.trim();
    const detail = details.get(rowId);
    if (!name) {
      continue;
    }
    records.push({
      rowId,
      name,
      employer: employer || undefined,
      totalPay: totalPay || undefined,
      subAgencyType: subAgency || detail?.subAgencyType,
      title: detail?.title,
      payYear: detail?.payYear,
      payBasis: detail?.payBasis,
      branch: detail?.branch,
    });
  }
  return records;
}

function extractDetailMap(
  html: string,
): Map<string, Partial<SeeThroughNyPayrollRecord>> {
  const map = new Map<string, Partial<SeeThroughNyPayrollRecord>>();
  const expandRe = /<tr\b[^>]*id="expandRow(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = expandRe.exec(html)) !== null) {
    const rowId = match[1];
    const inner = match[2];
    map.set(rowId, {
      subAgencyType: detailValue(inner, "SubAgency/Type"),
      title: detailValue(inner, "Title"),
      payYear: detailValue(inner, "Pay Year"),
      payBasis: detailValue(inner, "Pay Basis"),
      branch: detailValue(inner, "Branch/Major Category"),
    });
  }
  return map;
}

/**
 * Detail rows are `<strong>Label</strong>` followed by a value cell. Pull the
 * value text that follows a given label.
 */
function detailValue(inner: string, label: string): string | undefined {
  const re = new RegExp(
    `<strong>\\s*${escapeRegExp(label)}\\s*</strong>[\\s\\S]*?<div[^>]*>([\\s\\S]*?)<\\/div>`,
    "i",
  );
  const match = inner.match(re);
  if (!match) {
    return undefined;
  }
  const value = stripTags(match[1]).trim();
  return value || undefined;
}

function stripTagsFromCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(rowHtml)) !== null) {
    cells.push(stripTags(match[1]));
  }
  return cells;
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
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

function dedupKey(
  fullName: string,
  record: SeeThroughNyPayrollRecord,
): string {
  return `${normalizeKey(fullName)}__${normalizeKey(record.employer ?? "")}`;
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

/**
 * SeeThroughNY publishes payroll data current as of December 31 for prior
 * years. Use the most recent fully-published year. Kept as a function so the
 * rolling year advances without a code change after each new year.
 */
function latestPayYear(): number {
  const now = new Date();
  // The latest complete data year lags the calendar year by one.
  return now.getFullYear() - 1;
}

export type SeeThroughNyPayrollRecord = {
  /** Internal SeeThroughNY result row id (used for dedup/stable ids). */
  rowId?: string;
  /** Employee name as displayed (e.g. "Cuomo, Andrew M"). */
  name: string;
  /** Employer / agency shown in the result row. */
  employer?: string;
  /** Total pay for the pay year (display-formatted, e.g. "$96,809"). */
  totalPay?: string;
  /** Sub-agency or employment type label (e.g. "NYSTRS - Educator"). */
  subAgencyType?: string;
  /** Position title from the detail row. */
  title?: string;
  /** Pay year from the detail row (e.g. "2023"). */
  payYear?: string;
  /** Pay basis from the detail row (e.g. "per Annum"). */
  payBasis?: string;
  /** Branch / major category from the detail row (e.g. "New York City"). */
  branch?: string;
};
