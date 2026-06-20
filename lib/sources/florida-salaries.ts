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
 * Florida "Has a Right to Know" — State of Florida Employee Salaries
 * (https://salaries.myflorida.com/) official public-records portal. Public, no
 * key. The portal exposes a stable CSV export endpoint that is searchable by
 * employee name via the `by_name` query parameter. Searches State of Florida
 * employees and creates one context profile per matching employee, preserving
 * the public payroll record (name, agency, class title, state hire date) as a
 * source record. Public-record employment context only, not residential,
 * contact, or identity-verification evidence.
 */

export type FloridaSalariesIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type FloridaSalariesIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "florida_state_employee_salaries";
const FLORIDA_SALARIES_URL = "https://salaries.myflorida.com/";

export async function ingestFloridaSalaries(
  input: FloridaSalariesIngestInput,
): Promise<FloridaSalariesIngestResult> {
  registerFloridaSalariesSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: FLORIDA_SALARIES_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildSalariesUrl({ first, last });
  const response = await fetch(url, {
    headers: {
      accept: "text/csv",
      "user-agent": "PeopleSearchFloridaSalariesIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Florida state employee salaries request failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const records = parseSalaryCsv(csv);
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
    const profile = mapFloridaSalaryRecordToProfileInput(record, fullName);
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

export function registerFloridaSalariesSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "State of Florida Employee Salaries",
    category: "Public payroll record",
    jurisdiction: "Florida",
    acquisitionMethod: "official_api",
    licenseUrl: "https://salaries.myflorida.com/",
    notes:
      "Official State of Florida 'Has a Right to Know' employee salary portal (Department of Management Services data). Use as public-record employment context only; agency and class-title affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapFloridaSalaryRecordToProfileInput(
  record: FloridaSalaryRecord,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const agency = record.agencyName;
  const title = record.classTitle;
  const year = yearFromHireDate(record.stateHireDate);

  const aliases = [
    agency ? `Last known institution: ${agency}` : "",
    title ? `Title: ${title}` : "",
    year ? `Year: ${year}` : "",
  ].filter(Boolean);

  const recordId = `${normalizeKey(fullName)}__${normalizeKey(
    agency ?? "unknown",
  )}__${normalizeKey(record.positionNumber ?? "pos")}`;

  return {
    id: `p_flsalary_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: agency
      ? [
          {
            city: agency,
            state: "FL",
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

function buildSalariesUrl(input: { first: string; last: string }) {
  const url = new URL(FLORIDA_SALARIES_URL);
  url.searchParams.set("action", "index");
  url.searchParams.set("controller", "salaries");
  url.searchParams.set("format", "csv");
  // The portal matches the combined "first last" string against name columns.
  // Prefer "first last"; when only one token is present send it alone so a
  // last-name-only query still resolves.
  const nameQuery = [input.first, input.last].filter(Boolean).join(" ").trim();
  if (nameQuery) {
    url.searchParams.set("by_name", nameQuery);
  }
  return url.toString();
}

/**
 * Minimal RFC-4180-ish CSV parser. The Florida export is a fixed 13-column
 * table; the only field that may be quoted (and contain a comma) is the salary
 * column, but this parser handles quoting/escaping generally to stay robust.
 */
function parseSalaryCsv(csv: string): FloridaSalaryRecord[] {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) {
    return [];
  }
  const header = rows[0];
  const indexes = columnIndexes(header);
  const records: FloridaSalaryRecord[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.length === 1 && cells[0].trim() === "") {
      continue;
    }
    records.push(recordFromRow(cells, indexes));
  }
  return records;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Ignore — handled by the following \n.
    } else {
      field += char;
    }
  }
  // Flush a trailing field/row when the file does not end on a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function columnIndexes(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, index) => {
    map.set(name.trim().toLowerCase(), index);
  });
  return map;
}

function recordFromRow(
  cells: string[],
  indexes: Map<string, number>,
): FloridaSalaryRecord {
  const get = (name: string) => cells[indexes.get(name) ?? -1]?.trim();
  return {
    agencyName: get("agency name"),
    budgetEntity: get("budget entity"),
    positionNumber: get("position number"),
    lastName: get("last name"),
    firstName: get("first name"),
    middleName: get("middle name"),
    employeeType: get("employee type"),
    fullOrPartTime: get("full/part time"),
    classCode: get("class code"),
    classTitle: get("class title"),
    stateHireDate: get("state hire date"),
    salary: get("salary"),
    opsHourlyRate: get("ops hourly rate"),
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

function employeeFullName(record: FloridaSalaryRecord): string {
  const first = (record.firstName ?? "").trim();
  const last = (record.lastName ?? "").trim();
  const middle = (record.middleName ?? "").trim();
  return [first, middle, last].filter(Boolean).join(" ").trim();
}

function dedupKey(fullName: string, record: FloridaSalaryRecord): string {
  return `${normalizeKey(fullName)}__${normalizeKey(record.agencyName ?? "")}`;
}

function yearFromHireDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{4})/);
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

export type FloridaSalaryRecord = {
  agencyName?: string;
  budgetEntity?: string;
  positionNumber?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  employeeType?: string;
  fullOrPartTime?: string;
  classCode?: string;
  classTitle?: string;
  stateHireDate?: string;
  /** Stored as e.g. "$     6,0934.90" (padded, comma-formatted). */
  salary?: string;
  opsHourlyRate?: string;
};
