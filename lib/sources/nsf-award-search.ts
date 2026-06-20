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
 * NSF Award Search (https://api.nsf.gov/services/v1/awards.json) — public, no
 * key. Searches NSF awards by principal investigator name and creates one
 * context profile per matching PI, preserving the award (title, awardee
 * institution, start year) as a source record. Federal research-grant context
 * only, not residential or identity-verification evidence.
 */

export type NsfAwardIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type NsfAwardIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "nsf_award_search";
const NSF_AWARDS_URL = "https://api.nsf.gov/services/v1/awards.json";

export async function ingestNsfAwards(
  input: NsfAwardIngestInput,
): Promise<NsfAwardIngestResult> {
  registerNsfAwardSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: NSF_AWARDS_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildNsfAwardsUrl({ first, last });
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchNsfAwardIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `NSF Award Search request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as NsfAwardsResponse;
  const awards = applyImportLimit(payload.response?.award ?? [], limit);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByPi = new Map<string, UpsertProfileInput>();
  for (const award of awards) {
    const fullName = nsfPiFullName(award);
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
    if (profilesByPi.has(key)) {
      continue;
    }
    const profile = mapNsfAwardToProfileInput(award, fullName);
    if (profile) {
      profilesByPi.set(key, profile);
    }
  }

  let imported = 0;
  for (const profile of profilesByPi.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: awards.length, imported, url };
}

export function registerNsfAwardSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "NSF Award Search API",
    category: "Federal research grant PI mention",
    jurisdiction: "US",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.research.gov/awardapi-service/About-Award-API.xhtml",
    notes:
      "Official NSF Award Search API. Use as federal research-grant PI context only; awardee institution and grant affiliation are not residential, contact, or identity-verification evidence.",
  });
}

export function mapNsfAwardToProfileInput(
  award: NsfAward,
  fullName: string,
): UpsertProfileInput | null {
  if (!fullName) {
    return null;
  }

  const institution = award.awardeeName;
  const country = award.awardeeCountryCode;
  const year = yearFromNsfDate(award.startDate);

  const aliases = [
    institution ? `Last known institution: ${institution}` : "",
    year ? `Year: ${year}` : "",
  ].filter(Boolean);

  return {
    id: `p_nsf_${normalizeKey(fullName)}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: institution
      ? [
          {
            city: institution,
            state: country || "Global",
            kind: "scholarly affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: `${award.id ?? "award"}__${normalizeKey(fullName)}`,
      raw: { award, matchedPi: fullName },
    },
  };
}

function buildNsfAwardsUrl(input: { first: string; last: string }) {
  const url = new URL(NSF_AWARDS_URL);
  if (input.first) {
    url.searchParams.set("piFirstName", input.first);
  }
  if (input.last) {
    url.searchParams.set("piLastName", input.last);
  }
  url.searchParams.set("offset", "0");
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

function nsfPiFullName(award: NsfAward): string {
  const combined = `${award.piFirstName ?? ""} ${award.piLastName ?? ""}`.trim();
  return combined;
}

function yearFromNsfDate(value: string | undefined): string | undefined {
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

export type NsfAward = {
  id?: string | number;
  title?: string;
  awardeeName?: string;
  awardeeCountryCode?: string;
  piFirstName?: string;
  piLastName?: string;
  startDate?: string;
  fundsObligatedAmt?: number | string;
};

type NsfAwardsResponse = {
  response?: {
    award?: NsfAward[];
  };
};
