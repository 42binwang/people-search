import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type FederalRegisterIngestInput = {
  query: string;
  limit?: number;
};

export type FederalRegisterIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "federal_register_documents";

export async function ingestFederalRegisterMentions(
  input: FederalRegisterIngestInput,
): Promise<FederalRegisterIngestResult> {
  registerFederalRegisterSource();

  const limit = clampLimit(input.limit, 100);
  const url = buildFederalRegisterUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchFederalRegisterIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Federal Register request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as FederalRegisterResponse;
  const results = applyImportLimit(payload.results ?? [], limit);
  let imported = 0;

  for (const document of results) {
    const profile = mapFederalRegisterDocumentToProfileInput(
      input.query,
      document,
    );
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

export function registerFederalRegisterSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "FederalRegister.gov Document API",
    category: "Federal Register document mention",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://www.federalregister.gov/developers/documentation/api/v1",
    notes:
      "Official FederalRegister.gov API. Use as public-document mention context only, not identity or contact evidence.",
  });
}

export function mapFederalRegisterDocumentToProfileInput(
  query: string,
  document: FederalRegisterDocument,
): UpsertProfileInput | null {
  if (!query.trim() || !document.document_number || !document.title) {
    return null;
  }

  const agencies = (document.agencies ?? [])
    .map((agency) => agency.name || agency.raw_name)
    .filter(Boolean);

  return {
    id: `p_fr_${slugify(query)}_${document.document_number}`,
    fullName: titleCaseName(query),
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      `Federal Register mention: ${document.title}`,
      document.publication_date
        ? `Publication date: ${document.publication_date}`
        : "",
      agencies.length ? `Agency: ${agencies.join(", ")}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: "Federal Register",
        state: "US",
        kind: "public document mention",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: document.document_number,
      raw: document,
    },
  };
}

function buildFederalRegisterUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
  url.searchParams.set("conditions[term]", input.query);
  if (input.limit) {
    url.searchParams.set("per_page", String(input.limit));
  }
  for (const field of [
    "title",
    "document_number",
    "html_url",
    "publication_date",
    "agencies",
  ]) {
    url.searchParams.append("fields[]", field);
  }
  return url.toString();
}

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type FederalRegisterResponse = {
  results?: FederalRegisterDocument[];
};

export type FederalRegisterDocument = {
  title: string;
  document_number: string;
  html_url?: string;
  publication_date?: string;
  agencies?: Array<{
    name?: string;
    raw_name?: string;
  }>;
};
