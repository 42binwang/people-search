import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type OrcidIngestInput = {
  query: string;
  limit?: number;
};

export type OrcidIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "orcid_public_registry";

export async function ingestOrcidPublicRecords(
  input: OrcidIngestInput,
): Promise<OrcidIngestResult> {
  registerOrcidSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildOrcidExpandedSearchUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchOrcidIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ORCID request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OrcidExpandedSearchResponse;
  const records = applyImportLimit(payload["expanded-result"] ?? [], limit);
  let imported = 0;
  let enrichedCount = 0;

  for (const record of records) {
    const profile = mapOrcidRecordToProfileInput(input.query, record);
    if (!profile) {
      continue;
    }

    // Enrich a bounded subset of matched records with the researcher-declared
    // website/social links (the ORCID field where a researcher lists, e.g.,
    // their LinkedIn). These power OUTBOUND LINKS ONLY on the profile page —
    // we never scrape the linked sites. Capped to keep ingest latency inside
    // the per-source refresh timeout.
    if (record["orcid-id"] && enrichedCount < RESEARCHER_URL_ENRICHMENT_CAP) {
      const urls = await fetchResearcherUrls(record["orcid-id"]);
      if (urls.length > 0) {
        record["researcher-urls"] = urls.map((url) => ({ url }));
      }
      enrichedCount += 1;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: records.length,
    imported,
    url,
  };
}

export function registerOrcidSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "ORCID Public Registry API",
    category: "Researcher identifier metadata",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://info.orcid.org/documentation/features/public-data-file/",
    notes:
      "ORCID public registry search. Use as researcher identifier context only; public profile metadata is not residential, contact, employment, or identity-verification evidence.",
  });
}

export function mapOrcidRecordToProfileInput(
  query: string,
  record: OrcidExpandedRecord,
): UpsertProfileInput | null {
  const displayName = record["credit-name"] || formatOrcidName(record);
  if (!record["orcid-id"] || !displayName || !nameMatchesQuery(displayName, query)) {
    return null;
  }

  const institutions = uniqueStrings(record["institution-name"]).slice(0, 5);
  const otherNames = uniqueStrings(record["other-name"]).slice(0, 5);

  return {
    id: `p_orcid_${slugify(record["orcid-id"])}`,
    fullName: displayName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases: [
      `ORCID iD: ${record["orcid-id"]}`,
      ...otherNames.map((name) => `Other ORCID name: ${name}`),
      ...institutions.map((name) => `Public institution metadata: ${name}`),
    ],
    locations: institutions.length
      ? institutions.map((institution) => ({
          city: institution,
          state: "ORCID public metadata",
          kind: "researcher affiliation metadata",
          sourceId,
        }))
      : [
          {
            city: "ORCID",
            state: "Global",
            kind: "researcher identifier metadata",
            sourceId,
          },
        ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: record["orcid-id"],
      raw: record,
    },
  };
}

function buildOrcidExpandedSearchUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://pub.orcid.org/v3.0/expanded-search/");
  url.searchParams.set("q", input.query);
  if (input.limit) {
    url.searchParams.set("rows", String(input.limit));
  }
  return url.toString();
}

/** Max matched records to enrich with researcher-URLs per ingest (bounds latency). */
const RESEARCHER_URL_ENRICHMENT_CAP = 10;

/**
 * Fetch a researcher's self-declared website/social links (the ORCID field
 * where researchers list, e.g., LinkedIn). Outbound-link-only; we never follow
 * or scrape the linked URLs. Failures are non-fatal — we simply skip enrichment.
 */
async function fetchResearcherUrls(orcidId: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://pub.orcid.org/v3.0/${encodeURIComponent(orcidId)}/researcher-urls`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "PeopleSearchOrcidIngest/0.1 local-development",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as {
      "researcher-url"?: Array<{ url?: { value?: string } }>;
    };
    return (payload["researcher-url"] ?? [])
      .map((entry) => entry?.url?.value)
      .filter((value): value is string => Boolean(value && value.trim()));
  } catch {
    return [];
  }
}

function formatOrcidName(record: OrcidExpandedRecord) {
  return [record["given-names"], record["family-names"]]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function uniqueStrings(values: string[] | undefined) {
  return Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type OrcidExpandedSearchResponse = {
  "expanded-result"?: OrcidExpandedRecord[];
};

export type OrcidExpandedRecord = {
  "orcid-id": string;
  "given-names"?: string;
  "family-names"?: string;
  "credit-name"?: string;
  "other-name"?: string[];
  "institution-name"?: string[];
  "researcher-urls"?: Array<{ url: string }>;
};
