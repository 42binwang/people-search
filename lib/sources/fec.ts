import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type FecIngestInput = {
  query: string;
  apiKey?: string;
  limit?: number;
};

export type FecIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "fec_openfec_candidates";

export async function ingestFecCandidates(
  input: FecIngestInput,
): Promise<FecIngestResult> {
  registerFecSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildFecCandidateUrl({
    query: input.query,
    limit,
    apiKey: input.apiKey || process.env.FEC_API_KEY || "DEMO_KEY",
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchFecIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FEC request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as FecCandidateResponse;
  const results = applyImportLimit(payload.results ?? [], limit);
  let imported = 0;

  for (const candidate of results) {
    const profile = mapFecCandidateToProfileInput(candidate);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: results.length,
    imported,
    url,
  };
}

export function registerFecSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Federal Election Commission OpenFEC Candidate API",
    category: "Federal candidate record",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://api.open.fec.gov/developers/",
    notes:
      "Official FEC campaign finance API. Use as civic/candidate context, not residential contact data.",
  });
}

export function mapFecCandidateToProfileInput(
  candidate: FecCandidate,
): UpsertProfileInput | null {
  if (!candidate.candidate_id || !candidate.name) {
    return null;
  }

  const location =
    candidate.state || candidate.office_full
      ? [
          {
            city: candidate.office_full || "Federal election",
            state: candidate.state || "US",
            kind: "candidate jurisdiction",
            sourceId,
          },
        ]
      : [];

  const aliases = [
    candidate.party_full ? `Party: ${candidate.party_full}` : "",
    candidate.office_full ? `Office: ${candidate.office_full}` : "",
    candidate.active_through
      ? `Active through election cycle: ${candidate.active_through}`
      : "",
  ].filter(Boolean);

  return {
    id: `p_fec_${candidate.candidate_id}`,
    fullName: titleCaseCandidateName(candidate.name),
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: location,
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: candidate.candidate_id,
      raw: candidate,
    },
  };
}

function buildFecCandidateUrl(input: {
  query: string;
  limit: number | undefined;
  apiKey: string;
}) {
  const url = new URL("https://api.open.fec.gov/v1/candidates/search/");
  url.searchParams.set("q", input.query);
  if (input.limit) {
    url.searchParams.set("per_page", String(input.limit));
  }
  url.searchParams.set("api_key", input.apiKey);
  return url.toString();
}

function titleCaseCandidateName(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ordered = parts.length > 1 ? `${parts.slice(1).join(" ")} ${parts[0]}` : value;
  return ordered
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bIi\b/g, "II")
    .replace(/\bIii\b/g, "III")
    .trim();
}

type FecCandidateResponse = {
  results?: FecCandidate[];
};

export type FecCandidate = {
  candidate_id: string;
  name: string;
  state?: string;
  office_full?: string;
  party_full?: string;
  active_through?: number;
};
