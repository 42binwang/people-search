import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type FecScheduleAIngestInput = {
  query: string;
  state?: string;
  city?: string;
  apiKey?: string;
  limit?: number;
};

export type FecScheduleAIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "fec_openfec_schedule_a";

export async function ingestFecScheduleAContributions(
  input: FecScheduleAIngestInput,
): Promise<FecScheduleAIngestResult> {
  registerFecScheduleASource();

  const limit = clampLimit(input.limit, 100);
  const apiKey = input.apiKey || process.env.FEC_API_KEY || "DEMO_KEY";
  const url = buildFecScheduleAUrl({
    query: input.query,
    state: input.state,
    city: input.city,
    limit,
    apiKey,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchFecScheduleAIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `FEC Schedule A request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as FecScheduleAResponse;
  const results = applyImportLimit(payload.results ?? [], limit);
  let imported = 0;

  for (const contribution of results) {
    const profile = mapFecContributionToProfileInput(contribution);
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

export function registerFecScheduleASource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Federal Election Commission OpenFEC Individual Contributions",
    category: "Federal campaign contribution record",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://api.open.fec.gov/developers/",
    notes:
      "Official FEC Schedule A itemized individual contributions. Captures contributor name, mailing address, occupation, and employer as self-reported on disclosure forms. Use as civic/financial-disclosure context, not residential identity verification.",
  });
}

export function mapFecContributionToProfileInput(
  contribution: FecContribution,
): UpsertProfileInput | null {
  const fullName = buildContributorFullName(contribution);
  const location = buildContributorLocation(contribution);
  if (!fullName || !location) {
    return null;
  }

  const recordId = buildContributorRecordId(contribution);
  const aliases = [
    contribution.contributor_occupation
      ? `Occupation: ${contribution.contributor_occupation}`
      : "",
    contribution.contributor_employer
      ? `Employer: ${contribution.contributor_employer}`
      : "",
    contribution.committee?.committee_name
      ? `Contributed to: ${contribution.committee.committee_name}`
      : "",
    contribution.contribution_receipt_date
      ? `Contribution date: ${contribution.contribution_receipt_date}`
      : "",
  ].filter(Boolean);

  return {
    id: `p_fec_ind_${recordId}`,
    fullName,
    ageRange: "Unknown",
    confidence: "Medium",
    aliases,
    locations: [
      {
        street: location.street,
        city: location.city,
        state: location.state,
        zip: location.zip,
        kind: "campaign contribution address",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: recordId,
      raw: contribution,
    },
  };
}

function buildContributorFullName(contribution: FecContribution): string {
  const first = (contribution.contributor_first_name ?? "").trim();
  const last = (contribution.contributor_last_name ?? "").trim();
  if (first || last) {
    return titleCase([first, last].filter(Boolean).join(" "));
  }
  return parseContributorNameField(contribution.contributor_name ?? "");
}

function parseContributorNameField(name: string): string {
  // FEC names are often "LAST, FIRST MIDDLE"
  const parts = name.split(",").map((part) => part.trim()).filter(Boolean);
  const ordered =
    parts.length > 1
      ? `${parts.slice(1).join(" ")} ${parts[0]}`.trim()
      : name.trim();
  return titleCase(ordered);
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .trim();
}

function buildContributorLocation(contribution: FecContribution):
  | { street: string; city: string; state: string; zip: string }
  | null {
  const city = (contribution.contributor_city ?? "").trim();
  const state = (contribution.contributor_state ?? "").trim().toUpperCase();
  if (!city || !state) {
    return null;
  }
  return {
    street: (contribution.contributor_street_1 ?? "").trim(),
    city,
    state,
    zip: (contribution.contributor_zip ?? "").trim(),
  };
}

function buildContributorRecordId(contribution: FecContribution): string {
  const first = slugify(contribution.contributor_first_name ?? "");
  const last = slugify(contribution.contributor_last_name ?? "");
  const street = slugify(contribution.contributor_street_1 ?? "");
  const city = slugify(contribution.contributor_city ?? "");
  const state = (contribution.contributor_state ?? "").toLowerCase().trim();
  const zip = (contribution.contributor_zip ?? "").trim().slice(0, 5);
  return `${last}_${first}_${street}_${city}_${state}_${zip}`;
}

function buildFecScheduleAUrl(input: {
  query: string;
  state: string | undefined;
  city: string | undefined;
  limit: number | undefined;
  apiKey: string;
}) {
  const url = new URL("https://api.open.fec.gov/v1/schedules/schedule_a/");
  url.searchParams.set("contributor_name", input.query);
  if (input.state) {
    url.searchParams.set("contributor_state", input.state.toUpperCase());
  }
  if (input.city) {
    url.searchParams.set("contributor_city", input.city.toUpperCase());
  }
  if (input.limit) {
    url.searchParams.set("per_page", String(input.limit));
  }
  url.searchParams.set("api_key", input.apiKey);
  return url.toString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type FecScheduleAResponse = {
  results?: FecContribution[];
};

export type FecContribution = {
  contributor_first_name?: string | null;
  contributor_last_name?: string | null;
  contributor_middle_name?: string | null;
  contributor_name?: string | null;
  contributor_street_1?: string | null;
  contributor_street_2?: string | null;
  contributor_city?: string | null;
  contributor_state?: string | null;
  contributor_zip?: string | null;
  contributor_occupation?: string | null;
  contributor_employer?: string | null;
  contribution_receipt_date?: string | null;
  contribution_receipt_amount?: number | null;
  memo_text?: string | null;
  report_year?: number | null;
  committee?: {
    committee_id?: string;
    committee_name?: string;
  } | null;
};
