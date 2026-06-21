import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type BuffaloPermitsIngestInput = {
  /** Searched first name (given). Used to narrow applicant matches. */
  firstName?: string;
  /** Searched last name (surname). Drives the server-side applicant query. */
  lastName?: string;
  /** Fallback: a raw token (treated as last name) when split fields are absent. */
  query?: string;
  limit?: number;
};

export type BuffaloPermitsIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "buffalo_ny_building_permits";
const DOMAIN = "data.buffalony.gov";
const DATASET = "9p2d-f3yt";

// Buffalo stores the applicant as "LAST FIRST [MIDDLE]" (all caps). A real
// individual applicant reads like "SMITH CLARA L"; contractor businesses read
// like "ACME PLUMBING LLC". We keep individual-looking applicants only so the
// source stays person-bearing and does not flood search with business names.
const BUSINESS_TOKENS =
  /\b(LLC|LLP|INC|CORP|CORPORATION|CO|LTD|LIMITED|COMPANY|ASSOCIATES?|CONTRACTORS?|CONSTRUCTION|SERVICES?|GROUP|ENTERPRISES?|INDUSTRIES|PLUMBING|ELECTRIC|ELECTRICAL|HEATING|ROOFING|BUILDERS?|EXCAVATING|HVAC|MECHANICAL|MASONRY|PAINTING|DIGGING|SEWER)\b/i;

export async function ingestBuffaloPermits(
  input: BuffaloPermitsIngestInput,
): Promise<BuffaloPermitsIngestResult> {
  registerBuffaloPermitsSource();

  const limit = clampLimit(input.limit, 100);
  // Buffalo stores applicants surname-first in ALL CAPS ("SMITH CLARA L").
  // Socrata starts_with() is case-sensitive, so query in uppercase.
  const lastName = (
    input.lastName ||
    extractLastName(input.query) ||
    ""
  )
    .trim()
    .toUpperCase();
  if (!lastName) {
    return { fetched: 0, imported: 0, url: buildBuffaloUrl("", 0) };
  }

  const url = buildBuffaloUrl(lastName, limit);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchBuffaloPermitsIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Buffalo permits request failed: ${response.status} ${response.statusText}`,
    );
  }

  const rows = applyImportLimit(
    (await response.json()) as BuffaloPermitRow[],
    limit,
  );
  let imported = 0;

  for (const row of rows) {
    const profile = mapBuffaloPermitRowToProfileInput(row, input.firstName);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: rows.length, imported, url };
}

export function registerBuffaloPermitsSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "City of Buffalo Building Permits",
    category: "Municipal building permit applicant",
    jurisdiction: "Buffalo, NY",
    acquisitionMethod: "official_api",
    licenseUrl: "https://data.buffalony.gov/",
    notes:
      "Official City of Buffalo open-data building-permit dataset (Socrata). Person-bearing via the applicant field, stored surname-first. The permit-site address is a work site (or owner-occupied residence); it is NOT confirmed residence evidence. Contractor/business applicants are filtered out. Use as permit/work context only.",
  });
}

export function mapBuffaloPermitRowToProfileInput(
  row: BuffaloPermitRow,
  firstName?: string,
): UpsertProfileInput | null {
  const applicant = clean(row.applicant);
  if (!applicant || isBusinessApplicant(applicant)) {
    return null;
  }

  const tokens = applicant.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const [lastToken, firstToken, ...rest] = tokens;
  if (
    firstName &&
    !normalizeName(firstToken).startsWith(normalizeName(firstName).slice(0, 3))
  ) {
    return null;
  }

  const fullName = [firstToken, ...rest, lastToken]
    .map(titleCaseWord)
    .join(" ")
    .trim();
  const recordId = clean(row.apno);
  if (!recordId) {
    return null;
  }

  const licenseType = clean(row.lictype);
  const issued = clean(row.issued);
  const workDescription = clean(row.descofwork).slice(0, 160);

  return {
    id: `p_buffalo_permits_${slugify(recordId)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      `Buffalo permit #: ${recordId}`,
      licenseType ? `Permit type: ${licenseType}` : "",
      issued ? `Issued: ${issued.slice(0, 10)}` : "",
      workDescription ? `Work: ${workDescription}` : "",
    ].filter(Boolean),
    locations: [
      {
        street: clean(row.stname) || undefined,
        city: titleCaseWord(clean(row.city)) || "Buffalo",
        state: clean(row.state).toUpperCase() || "NY",
        zip: clean(row.zip) || undefined,
        kind: "building permit applicant (permit/work site; not confirmed residence)",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: row,
    },
  };
}

function buildBuffaloUrl(lastName: string, limit: number | undefined) {
  const url = new URL(`https://${DOMAIN}/resource/${DATASET}.json`);
  url.searchParams.set(
    "$select",
    "apno,applicant,lictype,stname,city,state,zip,issued,descofwork",
  );
  if (lastName) {
    url.searchParams.set("$where", `starts_with(applicant,'${lastName}')`);
  }
  if (limit && limit > 0) {
    url.searchParams.set("$limit", String(limit));
  }
  return url.toString();
}

function isBusinessApplicant(value: string) {
  return BUSINESS_TOKENS.test(value);
}

function extractLastName(query?: string) {
  if (!query) {
    return "";
  }
  return normalizeName(query).split(" ").filter(Boolean).shift() ?? "";
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseWord(value: string) {
  if (!value) {
    return "";
  }
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function slugify(value: string) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "_") || "unknown";
}

export type BuffaloPermitRow = {
  apno?: string;
  applicant?: string;
  lictype?: string;
  stname?: string;
  city?: string;
  state?: string;
  zip?: string;
  issued?: string;
  descofwork?: string;
};
