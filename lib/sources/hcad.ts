import { readFileSync } from "node:fs";
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

export type HcadIngestInput = {
  /** Path to extracted HCAD `real_acct.txt`. */
  realAcctFile: string;
  /** Path to extracted HCAD `owners.txt`. */
  ownersFile: string;
  /** Optional path to extracted HCAD `t_business_acct.txt` from `PP_files.zip`. */
  businessAcctFile?: string;
  /** Optional person name. When set, only matching owner names become profiles. */
  query?: string;
  /** Optional import cap. Defaults to 100. */
  limit?: number;
  /** HCAD tax year for provenance when not present in the row. */
  taxYear?: string;
};

export type HcadIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export type HcadOwnerRecord = {
  account: string;
  lineNumber?: string;
  name: string;
  aka?: string;
  percentOwned?: string;
  raw: Record<string, string>;
};

export type HcadRealAccountRecord = {
  account: string;
  taxYear?: string;
  ownerName?: string;
  mailingAddress?: HcadAddress;
  situsAddress?: HcadAddress;
  stateClass?: string;
  certifiedDate?: string;
  raw: Record<string, string>;
};

export type HcadBusinessAccountRecord = {
  account: string;
  taxYear?: string;
  name: string;
  businessName?: string;
  mailingAddress?: HcadAddress;
  siteAddress?: HcadAddress;
  phone?: string;
  scheduleCode?: string;
  classCode?: string;
  sic?: string;
  certifiedDate?: string;
  raw: Record<string, string>;
};

export type HcadAddress = {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
};

const sourceId = "hcad_harris_county_tx";
const DOWNLOAD_PAGE_URL = "https://hcad.org/pdata/pdata-property-downloads.html";
const CODEBOOK_URL = "https://hcad.org/assets/uploads/pdf/pdataCodebook.pdf";
const DOWNLOAD_API_URL =
  "https://hcad.org/actions/hcad-pdata/default/get-property-downloads";

const OWNER_COLUMNS = ["acct", "ln_num", "name", "aka", "pct_own"];

// HCAD's personal-property account file includes an explicitly published
// account phone field. Treat it as a source-observed account contact, not a
// personal/residential phone inference.
const BUSINESS_ACCT_COLUMNS = [
  "acct",
  "tax_year",
  "name",
  "bus_name",
  "site_addr",
  "site_city",
  "site_state",
  "site_zip",
  "mailto",
  "mail_addr_1",
  "mail_addr_2",
  "mail_city",
  "mail_state",
  "mail_zip",
  "phone",
  "dscr",
  "dscr1",
  "dscr2",
  "dscr3",
  "sched_cd",
  "sched_code_dscr",
  "class_code",
  "class_code_dscr",
  "sic",
  "sic_dscr",
  "sqft",
  "cntr_cd",
  "shared_cad",
  "key_map",
  "asd_val",
  "prior_asd_val",
  "return_cd",
  "value_status",
  "noticed",
  "noticed_dt",
  "protested",
  "certified_date",
  "agent_id",
  "jurs",
];

// HCAD publishes ASCII tab-delimited files. The codebook supplies this
// headerless column order for real_acct; the parser also accepts a header row.
const REAL_ACCT_COLUMNS = [
  "acct",
  "yr",
  "mailto",
  "mail_addr_1",
  "mail_addr_2",
  "mail_city",
  "mail_state",
  "mail_zip",
  "mail_country",
  "undeliverable",
  "str_pfx",
  "str_num",
  "str_num_sfx",
  "str",
  "str_sfx",
  "str_sfx_dir",
  "str_unit",
  "site_addr_1",
  "site_addr_2",
  "site_addr_3",
  "state_class",
  "school_dist",
  "map_facet",
  "key_map",
  "neighborhood_code",
  "neighborhood_grp",
  "market_area_1",
  "market_area_1_dscr",
  "market_area_2",
  "market_area_2_dscr",
  "econ_area",
  "econ_bld_class",
  "center_code",
  "yr_impr",
  "yr_annexed",
  "splt_dt",
  "dsc_cd",
  "nxt_bld",
  "bld_ar",
  "land_ar",
  "acreage",
  "cap_acct",
  "shared_cad",
  "land_val",
  "bld_val",
  "x_features_val",
  "ag_val",
  "assessed_val",
  "tot_appr_val",
  "tot_mkt_val",
  "prior_land_val",
  "prior_bld_val",
  "prior_x_features_val",
  "prior_ag_val",
  "prior_tot_appr_val",
  "prior_tot_mkt_val",
  "new_construction_val",
  "tot_rcn_val",
  "value_status",
  "noticed",
  "notice_dt",
  "protested",
  "certified_date",
  "rev_dt",
  "rev_by",
  "new_own_dt",
  "lgl_1",
  "lgl_2",
  "lgl_3",
  "lgl_4",
  "jurs",
];

export async function ingestHcad(input: HcadIngestInput): Promise<HcadIngestResult> {
  registerHcadSource();

  const owners = parseHcadOwners(readFileSync(input.ownersFile, "utf8"));
  const realAccounts = parseHcadRealAccounts(
    readFileSync(input.realAcctFile, "utf8"),
    input.taxYear,
  );
  const businessAccounts = input.businessAcctFile
    ? parseHcadBusinessAccounts(readFileSync(input.businessAcctFile, "utf8"), input.taxYear)
    : [];
  const accountsById = new Map(
    realAccounts.map((record) => [normalizeAccount(record.account), record]),
  );
  const requiredTokens = uniqueTokens(input.query ?? "");
  const limit = clampLimit(input.limit, 100);
  const profiles: UpsertProfileInput[] = [];

  for (const owner of owners) {
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(owner.name, requiredTokens)
    ) {
      continue;
    }

    const account = accountsById.get(normalizeAccount(owner.account));
    const profile = mapHcadOwnerToProfileInput(owner, account);
    if (profile) {
      profiles.push(profile);
    }
  }

  for (const businessAccount of businessAccounts) {
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(businessAccount.name, requiredTokens)
    ) {
      continue;
    }

    const profile = mapHcadBusinessAccountToProfileInput(businessAccount);
    if (profile) {
      profiles.push(profile);
    }
  }

  const limited = applyImportLimit(dedupeProfiles(profiles), limit);
  for (const profile of limited) {
    upsertProfile(profile);
  }

  return {
    fetched: profiles.length,
    imported: limited.length,
    url: [input.realAcctFile, input.ownersFile, input.businessAcctFile]
      .filter(Boolean)
      .join(";"),
  };
}

export function registerHcadSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Harris Central Appraisal District Property Data",
    category: "Property appraisal owner record",
    jurisdiction: "Harris County, Texas",
    acquisitionMethod: "official_bulk_file",
    licenseUrl: DOWNLOAD_PAGE_URL,
    notes:
      "Official HCAD public data text files from Real_acct_owner.zip and optional PP_files.zip/t_business_acct.txt. The source publishes owner names, owner mailing addresses, situs/location addresses, personal-property account phones, values, and legal descriptions. Use as source-observed property/appraisal or business personal-property context only; mailing and situs addresses are not proof of current residence, and phones are not inferred personal phones. Protected-address/suppression review remains required before public display.",
  });
}

export function parseHcadOwners(text: string): HcadOwnerRecord[] {
  return parseDelimitedRecords(text, OWNER_COLUMNS)
    .map((row): HcadOwnerRecord | null => {
      const account = getField(row, "acct");
      const name = cleanName(getField(row, "name"));
      if (!account || !name) {
        return null;
      }
      return {
        account,
        lineNumber: getField(row, "ln_num") || undefined,
        name,
        aka: cleanName(getField(row, "aka")) || undefined,
        percentOwned: getField(row, "pct_own") || undefined,
        raw: row,
      };
    })
    .filter((record): record is HcadOwnerRecord => Boolean(record));
}

export function parseHcadRealAccounts(
  text: string,
  defaultTaxYear?: string,
): HcadRealAccountRecord[] {
  return parseDelimitedRecords(text, REAL_ACCT_COLUMNS)
    .map((row): HcadRealAccountRecord | null => {
      const account = getField(row, "acct");
      if (!account) {
        return null;
      }

      const mailingAddress = normalizeAddress({
        street: joinStreet(getField(row, "mail_addr_1"), getField(row, "mail_addr_2")),
        city: getField(row, "mail_city"),
        state: getField(row, "mail_state"),
        zip: getField(row, "mail_zip"),
      });
      const situsStreet = getField(row, "site_addr_1");
      const situsCity = getField(row, "site_city") || getField(row, "site_addr_2");
      const situsZip = getField(row, "site_zip") || getField(row, "site_addr_3");
      const situsAddress = normalizeAddress({
        street: situsStreet,
        city: situsCity,
        state: getField(row, "site_state") || (situsStreet || situsCity || situsZip ? "TX" : ""),
        zip: situsZip,
      });

      return {
        account,
        taxYear: getField(row, "tax_year") || getField(row, "yr") || defaultTaxYear,
        ownerName: cleanName(getField(row, "mailto")) || undefined,
        mailingAddress,
        situsAddress,
        stateClass: getField(row, "state_class") || undefined,
        certifiedDate: getField(row, "certified_date") || undefined,
        raw: row,
      };
    })
    .filter((record): record is HcadRealAccountRecord => Boolean(record));
}

export function parseHcadBusinessAccounts(
  text: string,
  defaultTaxYear?: string,
): HcadBusinessAccountRecord[] {
  return parseDelimitedRecords(text, BUSINESS_ACCT_COLUMNS)
    .map((row): HcadBusinessAccountRecord | null => {
      const account = getField(row, "acct");
      const name = cleanName(getField(row, "name"));
      if (!account || !name) {
        return null;
      }

      const siteStreet = getField(row, "site_addr");
      const siteCity = getField(row, "site_city");
      const siteZip = getField(row, "site_zip");
      const siteAddress = normalizeAddress({
        street: siteStreet,
        city: siteCity,
        state: getField(row, "site_state") || (siteStreet || siteCity || siteZip ? "TX" : ""),
        zip: siteZip,
      });
      const mailingAddress = normalizeAddress({
        street: joinStreet(getField(row, "mail_addr_1"), getField(row, "mail_addr_2")),
        city: getField(row, "mail_city"),
        state: getField(row, "mail_state"),
        zip: getField(row, "mail_zip"),
      });

      return {
        account,
        taxYear: getField(row, "tax_year") || defaultTaxYear,
        name,
        businessName: cleanName(getField(row, "bus_name")) || undefined,
        mailingAddress,
        siteAddress,
        phone: cleanPhone(getField(row, "phone")) || undefined,
        scheduleCode: getField(row, "sched_cd") || undefined,
        classCode: getField(row, "class_code") || undefined,
        sic: getField(row, "sic") || undefined,
        certifiedDate: getField(row, "certified_date") || undefined,
        raw: row,
      };
    })
    .filter((record): record is HcadBusinessAccountRecord => Boolean(record));
}

export function mapHcadOwnerToProfileInput(
  owner: HcadOwnerRecord,
  account?: HcadRealAccountRecord,
): UpsertProfileInput | null {
  if (!owner.name) {
    return null;
  }

  const locations: NonNullable<UpsertProfileInput["locations"]> = [];
  if (account?.situsAddress?.city || account?.situsAddress?.street) {
    locations.push(addressToLocation(account.situsAddress, "property/situs address"));
  }
  if (account?.mailingAddress?.city || account?.mailingAddress?.street) {
    locations.push(addressToLocation(account.mailingAddress, "owner mailing address"));
  }

  const aliases = [
    owner.aka ? `AKA: ${owner.aka}` : "",
    owner.percentOwned ? `Percent ownership: ${owner.percentOwned}` : "",
    account?.taxYear ? `Tax year: ${account.taxYear}` : "",
    account?.stateClass ? `State class: ${account.stateClass}` : "",
    account?.certifiedDate ? `Certified date: ${account.certifiedDate}` : "",
  ].filter(Boolean);

  return {
    id: `p_hcad_${normalizeKey(owner.account)}_${normalizeKey(owner.name)}_${normalizeKey(
      owner.lineNumber || "owner",
    )}`,
    fullName: owner.name,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations,
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: `${normalizeAccount(owner.account)}_${owner.lineNumber || "owner"}`,
      raw: { owner, realAccount: account },
    },
  };
}

export function mapHcadBusinessAccountToProfileInput(
  record: HcadBusinessAccountRecord,
): UpsertProfileInput | null {
  if (!record.name) {
    return null;
  }

  const locations: NonNullable<UpsertProfileInput["locations"]> = [];
  if (record.siteAddress?.city || record.siteAddress?.street) {
    locations.push(
      addressToLocation(record.siteAddress, "business personal-property site address"),
    );
  }
  if (record.mailingAddress?.city || record.mailingAddress?.street) {
    locations.push(
      addressToLocation(record.mailingAddress, "business personal-property mailing address"),
    );
  }

  const aliases = [
    record.businessName ? `Business name: ${record.businessName}` : "",
    record.taxYear ? `Tax year: ${record.taxYear}` : "",
    record.scheduleCode ? `Schedule code: ${record.scheduleCode}` : "",
    record.classCode ? `Class code: ${record.classCode}` : "",
    record.sic ? `SIC: ${record.sic}` : "",
    record.certifiedDate ? `Certified date: ${record.certifiedDate}` : "",
  ].filter(Boolean);

  return {
    id: `p_hcad_business_${normalizeKey(record.account)}_${normalizeKey(record.name)}`,
    fullName: record.name,
    ageRange: "Unknown",
    confidence: "Low",
    aliases,
    locations,
    contacts: record.phone
      ? [{ type: "phone", value: record.phone, confidence: "Low", sourceId }]
      : [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: `business_${normalizeAccount(record.account)}`,
      raw: { businessAccount: record },
    },
  };
}

function parseDelimitedRecords(
  text: string,
  fallbackColumns: string[],
): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const delimiter = detectDelimiter(lines[0]);
  let columns = fallbackColumns;
  let startIndex = 0;
  const first = splitLine(lines[0], delimiter).map(normalizeColumnName);
  if (looksLikeHeader(first, fallbackColumns)) {
    columns = first;
    startIndex = 1;
  }

  return lines.slice(startIndex).map((line) => {
    const values = splitLine(line, delimiter);
    return Object.fromEntries(
      columns.map((column, index) => [column, clean(values[index] ?? "")]),
    );
  });
}

function detectDelimiter(line: string) {
  if (line.includes("\t")) {
    return "\t";
  }
  if (line.includes("|")) {
    return "|";
  }
  return ",";
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ",") {
    return splitCsvLine(line);
  }
  return line.split(delimiter);
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function looksLikeHeader(columns: string[], fallbackColumns: string[]) {
  const known = new Set(fallbackColumns);
  return columns[0] === "acct" || columns.filter((column) => known.has(column)).length >= 2;
}

function normalizeColumnName(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getField(row: Record<string, string>, key: string) {
  return clean(row[key] ?? "");
}

function clean(value: string) {
  return value.replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
}

function cleanName(value: string) {
  const cleaned = clean(value);
  if (!cleaned || /^unknown$/i.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function cleanPhone(value: string) {
  const cleaned = clean(value);
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) {
    return cleaned;
  }
  return "";
}

function joinStreet(...parts: string[]) {
  return parts.map(clean).filter(Boolean).join(" ") || undefined;
}

function normalizeAddress(address: HcadAddress): HcadAddress | undefined {
  const street = clean(address.street ?? "");
  const city = clean(address.city ?? "");
  const state = clean(address.state ?? "").toUpperCase();
  const zip = clean(address.zip ?? "").slice(0, 10);
  if (!street && !city && !state && !zip) {
    return undefined;
  }
  return {
    street: street || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
  };
}

function addressToLocation(
  address: HcadAddress,
  kind: string,
): NonNullable<UpsertProfileInput["locations"]>[number] {
  return {
    street: address.street,
    city: address.city || "Harris County",
    state: address.state || "TX",
    zip: address.zip,
    kind,
    sourceId,
  };
}

function normalizeAccount(value: string) {
  return clean(value).replace(/\D/g, "") || clean(value);
}

function normalizeKey(value: string) {
  return (
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function uniqueTokens(value: string): string[] {
  return Array.from(new Set(tokenizeName(value)));
}

function dedupeProfiles(profiles: UpsertProfileInput[]) {
  const byId = new Map<string, UpsertProfileInput>();
  for (const profile of profiles) {
    byId.set(profile.id, profile);
  }
  return Array.from(byId.values());
}

export { CODEBOOK_URL, DOWNLOAD_API_URL, DOWNLOAD_PAGE_URL, sourceId as HCAD_SOURCE_ID };
