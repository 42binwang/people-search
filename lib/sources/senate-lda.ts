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
 * Senate Lobbying Disclosure Act (LDA) API — https://lda.senate.gov/api/v1/.
 * Public, no key. Searches lobbying filings by lobbyist name and creates one
 * context profile per matching lobbyist (name + registrant firm + client +
 * year). Federal lobbying-filing context only, not residential or
 * identity-verification evidence.
 */

export type SenateLdaIngestInput = {
  firstName?: string;
  lastName?: string;
  /** Free-form name fallback; split into first/last when firstName/lastName absent. */
  query?: string;
  limit?: number;
};

export type SenateLdaIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "senate_lda_lobbying";
const LDA_FILINGS_URL = "https://lda.senate.gov/api/v1/filings/";

export async function ingestSenateLdaLobbying(
  input: SenateLdaIngestInput,
): Promise<SenateLdaIngestResult> {
  registerSenateLdaSource();

  const parsed = splitQuery(input.query);
  const first = (input.firstName ?? "").trim() || parsed.first;
  const last = (input.lastName ?? "").trim() || parsed.last;

  if (!first && !last) {
    return { fetched: 0, imported: 0, url: LDA_FILINGS_URL };
  }

  const limit = clampLimit(input.limit, 100);
  const url = buildFilingsUrl([first, last].filter(Boolean).join(" "));
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchSenateLdaIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Senate LDA request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as LdaFilingsResponse;
  const filings = applyImportLimit(payload.results ?? [], limit);
  const requiredTokens = uniqueTokens([first, last].filter(Boolean).join(" "));

  const profilesByLobbyist = new Map<string, UpsertProfileInput>();
  for (const filing of filings) {
    const registrantName = filing.registrant?.name;
    const clientName = filing.client?.name;
    const year = filing.filing_year;
    for (const activity of filing.lobbying_activities ?? []) {
      for (const entry of activity.lobbyists ?? []) {
        const lobbyist = entry.lobbyist;
        if (!lobbyist) {
          continue;
        }
        const fullName = [
          lobbyist.first_name,
          lobbyist.middle_name,
          lobbyist.last_name,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
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
        if (profilesByLobbyist.has(key)) {
          continue;
        }
        const profile = mapSenateLdaLobbyistToProfileInput({
          fullName,
          registrantName,
          clientName,
          year,
          filing,
        });
        if (profile) {
          profilesByLobbyist.set(key, profile);
        }
      }
    }
  }

  let imported = 0;
  for (const profile of profilesByLobbyist.values()) {
    upsertProfile(profile);
    imported += 1;
  }

  return { fetched: filings.length, imported, url };
}

export function registerSenateLdaSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Senate LDA Lobbying Filings API",
    category: "Federal lobbying filing lobbyist mention",
    jurisdiction: "US",
    acquisitionMethod: "official_api",
    licenseUrl: "https://lda.senate.gov/api/",
    notes:
      "Official Senate Lobbying Disclosure Act API. Use as federal lobbying-filing context only; registrant firm and client are affiliations, not residential, contact, or identity-verification evidence.",
  });
}

export function mapSenateLdaLobbyistToProfileInput(input: {
  fullName: string;
  registrantName?: string;
  clientName?: string;
  year?: number;
  filing: LdaFiling;
}): UpsertProfileInput | null {
  if (!input.fullName) {
    return null;
  }

  const aliases = [
    input.registrantName ? `Last known institution: ${input.registrantName}` : "",
    input.clientName ? `Lobbying client: ${input.clientName}` : "",
    typeof input.year === "number" ? `Year: ${input.year}` : "",
  ].filter(Boolean);

  return {
    id: `p_lda_${normalizeKey(input.fullName)}`,
    fullName: input.fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: input.registrantName
      ? [
          {
            city: input.registrantName,
            state: "US",
            kind: "lobbying filing affiliation",
            sourceId,
          },
        ]
      : [],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: `${input.filing.filing_uuid ?? "filing"}__${normalizeKey(input.fullName)}`,
      raw: { filing: input.filing, matchedLobbyist: input.fullName },
    },
  };
}

function buildFilingsUrl(lobbyistName: string) {
  const url = new URL(LDA_FILINGS_URL);
  url.searchParams.set("lobbyist_name", lobbyistName);
  url.searchParams.set("page_size", "50");
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

type LdaLobbyist = {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
};

type LdaLobbyistEntry = {
  lobbyist?: LdaLobbyist;
};

type LdaLobbyingActivity = {
  lobbyists?: LdaLobbyistEntry[];
};

export type LdaFiling = {
  filing_uuid?: string;
  filing_year?: number;
  client?: { name?: string; state?: string; country?: string };
  registrant?: { name?: string; city?: string; state?: string; country?: string };
  lobbying_activities?: LdaLobbyingActivity[];
};

type LdaFilingsResponse = {
  results?: LdaFiling[];
};
