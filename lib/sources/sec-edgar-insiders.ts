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
 * SEC EDGAR insiders (https://efts.sec.gov/LATEST/search-index) — public, no
 * key. Searches the EDGAR full-text search backend for Form 3/4/5 ownership
 * filings by insider/officer name and creates one context profile per matching
 * reporting owner, preserving the issuer (company), the insider relationship,
 * and the filing reference. SEC requires a descriptive User-Agent header on all
 * EDGAR requests; that is a courtesy/attribution requirement, NOT
 * authentication. Securities-filing context only, not residential or
 * identity-verification evidence.
 *
 * Endpoint notes:
 *  - `https://efts.sec.gov/LATEST/search-index?q=<name>&forms=3,4,5` is the
 *    official EDGAR full-text-search backend the public EDGAR search UI uses.
 *    Each Form 3/4/5 hit's `display_names` array holds BOTH the reporting
 *    owner (the insider) and the issuer (the company). The entry whose CIK
 *    corresponds to a person name is the insider; the corporate entry is the
 *    issuer. `biz_states`/`biz_locations` give the issuer location; `adsh`,
 *    `form`, and `file_date` identify the filing.
 *  - Role (officer/director/10% owner + officer title) is parsed best-effort
 *    from the primary Form 4 XML document; if the per-filing document fetch
 *    fails the role falls back to "Securities filing insider".
 */

export type SecEdgarInsiderIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type SecEdgarInsiderIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "sec_edgar_insiders";
const EDGAR_FTS_URL = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data";
/**
 * SEC asks for a descriptive User-Agent (sample company + admin contact) on all
 * EDGAR requests. This is an attribution requirement, not an API key or
 * registration.
 */
const EDGAR_USER_AGENT =
  "PeopleSearch SecEdgarInsiderIngest/0.1 local-development (research example; admin-contact: research-example@example.com)";

export async function ingestSecEdgarInsiders(
  input: SecEdgarInsiderIngestInput,
): Promise<SecEdgarInsiderIngestResult> {
  registerSecEdgarInsidersSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: EDGAR_FTS_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const fullNameQuery = [first, last].filter(Boolean).join(" ");
  const url = buildFtsUrl(fullNameQuery);
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": EDGAR_USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `SEC EDGAR full-text search request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as EdgarFtsResponse;
  const hits = applyImportLimit(payload.hits?.hits ?? [], limit);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByKey = new Map<string, UpsertProfileInput>();
  for (const hit of hits) {
    const source = hit._source;
    if (!source) {
      continue;
    }
    const identified = identifyInsider(source, fullNameQuery);
    if (!identified) {
      continue;
    }
    const { insiderName, issuerName, insiderCik, issuerCik, state, location } =
      identified;
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(insiderName, requiredTokens)
    ) {
      continue;
    }
    const dedupKey = `${normalizeKey(insiderName)}__${normalizeKey(issuerName)}`;
    if (profilesByKey.has(dedupKey)) {
      continue;
    }

    const role = await resolveRole(hit, identified).catch(() => undefined);

    const profile = mapSecEdgarInsiderToProfileInput(
      {
        form: source.form ?? source.file_type,
        adsh: source.adsh,
        fileDate: source.file_date,
        issuerName,
        issuerCik,
        insiderCik,
        state,
        location,
        role,
      },
      insiderName,
    );
    if (profile) {
      profilesByKey.set(dedupKey, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByKey.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: hits.length, imported, url };
}

export function registerSecEdgarInsidersSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "SEC EDGAR Insider Filings (Form 3/4/5)",
    category: "Securities filing insider mention",
    jurisdiction: "US",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.sec.gov/edgar/search-and-access",
    notes:
      "Official SEC EDGAR full-text search of Form 3/4/5 ownership filings. Use as public securities-filing context only (issuer affiliation + insider relationship); SEC EDGAR requires a descriptive User-Agent header, not an API key. Not residential, contact, or identity-verification evidence.",
  });
}

export type SecEdgarInsiderProfileFiling = {
  form?: string;
  adsh?: string;
  fileDate?: string;
  issuerName: string;
  issuerCik?: string;
  insiderCik?: string;
  state?: string;
  location?: string;
  role?: string;
};

export function mapSecEdgarInsiderToProfileInput(
  filing: SecEdgarInsiderProfileFiling,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const issuer = filing.issuerName;
  const role =
    filing.role && filing.role.trim().length > 0
      ? filing.role
      : "Securities filing insider (Form 3/4/5 reporting owner)";
  const year = yearFromDate(filing.fileDate);

  const aliases = [
    issuer ? `Last known institution: ${issuer}` : "",
    role ? `Role: ${role}` : "",
    year ? `Year: ${year}` : "",
  ].filter(Boolean);

  const recordId =
    filing.adsh != null
      ? `${filing.adsh}__${normalizeKey(fullName)}`
      : `${issuer ?? "issuer"}__${normalizeKey(fullName)}`;

  return {
    id: `p_secedgar_${normalizeKey(`${fullName}_${issuer ?? "issuer"}`)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: issuer
      ? [
          {
            city: issuer,
            state: filing.state || "US",
            kind: "corporate filing affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: { filing, matchedInsider: fullName },
    },
  };
}

/**
 * Identify which `display_names` entry is the reporting owner (the searched
 * person) vs the issuer (the company). In Form 3/4/5 filings `display_names`
 * and `ciks` are positionally aligned; the entry whose CIK corresponds to a
 * person name is the insider, the corporate-looking entry is the issuer.
 */
type IdentifiedInsider = {
  insiderName: string;
  issuerName: string;
  insiderCik?: string;
  issuerCik?: string;
  state?: string;
  location?: string;
};

function identifyInsider(
  source: EdgarFtsSource,
  queryName: string,
): IdentifiedInsider | null {
  const displayNames = source.display_names ?? [];
  const ciks = source.ciks ?? [];
  if (displayNames.length === 0) {
    return null;
  }

  const queryTokens = uniqueTokens(queryName);
  let personIndex = displayNames.findIndex((name) => {
    if (isCorporateName(name)) {
      return false;
    }
    if (queryTokens.length > 0) {
      return normalizedNameMatchesTokens(stripCikSuffix(name), queryTokens);
    }
    return true;
  });

  if (personIndex < 0) {
    // Fallback: the first non-corporate-looking entry is the reporter.
    personIndex = displayNames.findIndex((name) => !isCorporateName(name));
  }

  const insiderIndex = personIndex;
  let issuerIndex = displayNames.findIndex((name, i) => i !== insiderIndex);
  if (insiderIndex < 0) {
    // Ambiguous hit (e.g. two corporate names): treat first as issuer, none as insider.
    return null;
  }
  if (issuerIndex < 0) {
    issuerIndex = 0;
  }

  const insiderName = stripCikSuffix(displayNames[insiderIndex]).trim();
  if (!insiderName) {
    return null;
  }
  const issuerName = stripCikSuffix(displayNames[issuerIndex])
    .replace(/\s+/g, " ")
    .trim();

  const state = source.biz_states?.[issuerIndex] ?? source.biz_states?.[0];
  const location =
    source.biz_locations?.[issuerIndex] ?? source.biz_locations?.[0];

  return {
    insiderName,
    issuerName,
    insiderCik: ciks[insiderIndex],
    issuerCik: ciks[issuerIndex],
    state: state || undefined,
    location: location || undefined,
  };
}

/**
 * Best-effort enrichment: fetch the primary Form 4 XML and read the
 * reporting-owner relationship (director/officer/10% owner + officer title).
 * Returns `undefined` when the document is unreachable or unparseable; callers
 * fall back to a generic insider role.
 */
async function resolveRole(
  hit: EdgarFtsHit,
  identified: IdentifiedInsider,
): Promise<string | undefined> {
  const source = hit._source;
  if (!source?.adsh || !hit._id) {
    return undefined;
  }
  const fileName = hit._id.split(":").pop();
  const cik = identified.issuerCik ?? identified.insiderCik;
  if (!fileName || !cik) {
    return undefined;
  }
  const cikNoZeros = String(cik).replace(/^0+/, "");
  const adshNoDashes = source.adsh.replace(/-/g, "");
  const xmlUrl = `${EDGAR_ARCHIVES_URL}/${cikNoZeros}/${adshNoDashes}/${fileName}`;

  const response = await fetch(xmlUrl, {
    headers: { "user-agent": EDGAR_USER_AGENT },
    cache: "no-store",
  });
  if (!response.ok) {
    return undefined;
  }
  const xml = await response.text();
  return roleFromForm4Xml(xml);
}

function roleFromForm4Xml(xml: string): string | undefined {
  const isDirector = tagText(xml, "isDirector") === "1";
  const isOfficer = tagText(xml, "isOfficer") === "1";
  const isTenPercent = tagText(xml, "isTenPercentOwner") === "1";
  const officerTitle = tagText(xml, "officerTitle");

  const flags: string[] = [];
  if (isOfficer) {
    flags.push(officerTitle ? `Officer (${officerTitle})` : "Officer");
  }
  if (isDirector) {
    flags.push("Director");
  }
  if (isTenPercent) {
    flags.push("10% Owner");
  }
  if (flags.length === 0) {
    return undefined;
  }
  return flags.join(", ");
}

function tagText(xml: string, tag: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`),
  );
  if (!match) {
    return undefined;
  }
  return decodeXmlEntities(match[1]).trim() || undefined;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function isCorporateName(name: string): boolean {
  const cleaned = stripCikSuffix(name).toUpperCase();
  return /\b(CORP|CORPORATION|INC|INCORPORATED|LLC|LP|LIMITED|COMPANY|CO|TECHNOLOGIES|HOLDINGS|GROUP|TRUST|BANCORP|BANK|PARTNERS|PLC|AG|SA|NV|SE)\b/.test(
    cleaned,
  );
}

function stripCikSuffix(name: string): string {
  return name.replace(/\(CIK[^)]*\)/i, "");
}

function buildFtsUrl(queryName: string) {
  const url = new URL(EDGAR_FTS_URL);
  url.searchParams.set("q", queryName);
  url.searchParams.set("forms", "3,4,5");
  return url.toString();
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

function yearFromDate(value: string | undefined): string | undefined {
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

type EdgarFtsHit = {
  _id?: string;
  _source?: EdgarFtsSource;
};

type EdgarFtsSource = {
  ciks?: string[];
  display_names?: string[];
  adsh?: string;
  form?: string;
  file_type?: string;
  file_date?: string;
  biz_states?: string[];
  biz_locations?: string[];
};

type EdgarFtsResponse = {
  hits?: {
    hits?: EdgarFtsHit[];
  };
};
