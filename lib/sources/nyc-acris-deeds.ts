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
 * NYC ACRIS (Automated City Register Information System) real property records —
 * public, no key, via NYC Open Data (Socrata SODA). Searches recorded property
 * documents by grantor/grantee party name and creates one context profile per
 * matching party, preserving the party role and recorded address as a source
 * record. Public property-record mention context only, not residential or
 * identity-verification evidence.
 */

const sourceId = "nyc_acris_deeds";

const PARTIES_URL =
  "https://data.cityofnewyork.us/resource/636b-3b5g.json"; // ACRIS - Real Property Parties
const LEGALS_URL =
  "https://data.cityofnewyork.us/resource/8h5j-fqxa.json"; // ACRIS - Real Property Legals

export type NycAcrisIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; ACRIS stores parties as "LAST, FIRST". */
  query?: string;
  limit?: number;
};

export type NycAcrisIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

export async function ingestNycAcrisDeeds(
  input: NycAcrisIngestInput,
): Promise<NycAcrisIngestResult> {
  registerNycAcrisSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: PARTIES_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildPartiesUrl({ first, last, limit });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchNycAcrisIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `NYC ACRIS request failed: ${response.status} ${response.statusText}`,
    );
  }

  const parties = applyImportLimit(
    (await response.json()) as AcrisParty[],
    limit,
  );
  const requiredTokens = uniqueTokens([last, first].filter(Boolean).join(" "));

  // Resolve property addresses for the matched document_ids (one bulk lookup).
  const documentIds = parties
    .map((party) => party.document_id)
    .filter((id): id is string => Boolean(id));
  const legalByDocId = await fetchLegalsByDocumentIds(documentIds);

  const profilesByParty = new Map<string, UpsertProfileInput>();
  for (const party of parties) {
    const fullName = acrisPartyFullName(party);
    if (!fullName) {
      continue;
    }
    if (
      requiredTokens.length > 0 &&
      !normalizedNameMatchesTokens(fullName, requiredTokens)
    ) {
      continue;
    }
    const key = normalizeKey(fullName);
    if (profilesByParty.has(key)) {
      continue;
    }
    const legal = party.document_id
      ? legalByDocId.get(party.document_id)
      : undefined;
    const profile = mapNycAcrisPartyToProfileInput(party, fullName, legal);
    if (profile) {
      profilesByParty.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByParty.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: parties.length, imported, url };
}

export function registerNycAcrisSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "NYC ACRIS Real Property Records",
    category: "Real property record mention",
    jurisdiction: "New York City, NY",
    acquisitionMethod: "official_api",
    licenseUrl: "https://data.cityofnewyork.us/City-Government/ACRIS-Real-Property-Parties/636b-3b5g",
    notes:
      "Official NYC ACRIS Real Property Parties (Socrata) dataset. Use as public property-record context only; a recorded grantor/grantee name is not residential, contact, or identity-verification evidence.",
  });
}

export function mapNycAcrisPartyToProfileInput(
  party: AcrisParty,
  fullName: string,
  legal?: AcrisLegal,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const role = partyRoleLabel(party.party_type);
  const docId = party.document_id ?? "doc";

  const aliases = [role].filter(Boolean);

  const partyCity = party.city?.trim();
  const partyState = party.state?.trim();
  const legalStreet = legalStreetLine(legal);

  // Prefer the recorded party mailing address; fall back to the recorded
  // property address from the linked legals record.
  const locations: UpsertProfileInput["locations"] = [];
  if (partyCity || partyState) {
    locations.push({
      city: partyCity || "New York",
      state: partyState || "NY",
      kind: "property record",
      sourceId,
    });
  } else if (legalStreet) {
    locations.push({
      city: "New York",
      state: "NY",
      kind: "property record",
      sourceId,
    });
  }

  return {
    id: `p_acris_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations,
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: `${docId}__${normalizeKey(fullName)}`,
      raw: { party, matchedParty: fullName },
    },
  };
}

function buildPartiesUrl(input: {
  first: string;
  last: string;
  limit: number | undefined;
}) {
  // ACRIS stores names as "LAST, FIRST" (and business names verbatim). We
  // search case-insensitively on the leading token of the name so a grantor
  // surname match is reliable regardless of first-name spelling.
  const surname = (input.last || input.first).toUpperCase();
  const where = `upper(name) like '${surname.replace(/'/g, "''")}%'`;
  const params = new URLSearchParams({
    $where: where,
    $order: "document_id DESC",
    $limit: String(input.limit ?? 25),
  });
  return `${PARTIES_URL}?${params.toString()}`;
}

async function fetchLegalsByDocumentIds(
  documentIds: string[],
): Promise<Map<string, AcrisLegal>> {
  const unique = Array.from(new Set(documentIds));
  if (unique.length === 0) {
    return new Map();
  }
  const quoted = unique.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
  const params = new URLSearchParams({
    $where: `document_id in (${quoted})`,
    $limit: "1000",
  });
  const url = `${LEGALS_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchNycAcrisIngest/0.1 local-development",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return new Map();
    }
    const legals = (await response.json()) as AcrisLegal[];
    const map = new Map<string, AcrisLegal>();
    for (const legal of legals) {
      if (legal.document_id && !map.has(legal.document_id)) {
        map.set(legal.document_id, legal);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function legalStreetLine(legal: AcrisLegal | undefined): string | undefined {
  if (!legal) {
    return undefined;
  }
  const parts = [
    legal.street_number,
    legal.street_name,
    legal.unit,
  ]
    .map((part) => (part ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
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

function acrisPartyFullName(party: AcrisParty): string {
  // ACRIS stores individuals as "LAST, FIRST" and businesses verbatim.
  const name = (party.name ?? "").trim();
  if (!name) {
    return "";
  }
  const comma = name.indexOf(",");
  if (comma > 0) {
    const last = name.slice(0, comma).trim();
    const first = name.slice(comma + 1).trim();
    return `${first} ${last}`.trim();
  }
  return name;
}

function partyRoleLabel(partyType: string | undefined): string {
  switch (partyType) {
    case "1":
      return "Party role: grantor (seller)";
    case "2":
      return "Party role: grantee (buyer)";
    case "3":
      return "Party role: lender";
    default:
      return partyType ? `Party role code: ${partyType}` : "";
  }
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

export type AcrisParty = {
  document_id?: string;
  record_type?: string;
  party_type?: string;
  name?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  good_through_date?: string;
};

export type AcrisLegal = {
  document_id?: string;
  borough?: string;
  block?: string;
  lot?: string;
  street_number?: string;
  street_name?: string;
  unit?: string;
  property_type?: string;
};
