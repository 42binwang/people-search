import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type UsptoPatentIngestInput = {
  query: string;
  limit?: number;
  apiKey?: string;
};

export type UsptoPatentIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "uspto_patent_inventors";
const ENDPOINT = "https://api.patentsview.org/patents/query";

// PatentsView API (API key required — set PATENTSVIEW_API_KEY). Patent inventor
// records carry an inventor name plus a city/state (no street), so the location
// is imprecise and treated as context, not a residence.
export async function ingestUsptoPatentInventors(
  input: UsptoPatentIngestInput,
): Promise<UsptoPatentIngestResult> {
  registerUsptoPatentSource();

  const limit = clampLimit(input.limit, 100);
  const apiKey = input.apiKey || process.env.PATENTSVIEW_API_KEY;
  const { lastName } = splitQueryName(input.query);
  if (!lastName) {
    return { fetched: 0, imported: 0, url: ENDPOINT };
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      "user-agent": "PeopleSearchUsptoPatentIngest/0.1 local-development",
    },
    body: JSON.stringify({
      q: { inventor_last_name: { phrase: lastName } },
      f: [
        "patent_number",
        "patent_title",
        "inventors.inventor_first_name",
        "inventors.inventor_last_name",
        "inventors.inventor_city",
        "inventors.inventor_state",
        "assignees.assignee_organization",
      ],
      o: { per_page: limit ?? 25 },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `PatentsView request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as PatentsViewResponse;
  const patents = applyImportLimit(payload.patents ?? [], limit);
  let imported = 0;

  for (const patent of patents) {
    for (const profile of mapPatentToProfileInputs(input.query, patent)) {
      upsertProfile(profile);
      imported += 1;
    }
  }

  return { fetched: patents.length, imported, url: ENDPOINT };
}

export function registerUsptoPatentSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "USPTO Patent Inventors",
    category: "Federal patent inventor",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://patentsview.org/",
    notes:
      "Official PatentsView API (API key required). Use as federal patent inventor context only; inventor city/state is imprecise and not residential evidence.",
  });
}

export function mapPatentToProfileInputs(
  query: string,
  patent: PatentsViewPatent,
): UpsertProfileInput[] {
  const inventors = patent.inventors ?? [];
  if (inventors.length === 0 || !patent.patent_number) {
    return [];
  }
  const title = patent.patent_title || "Untitled patent";
  const assignee = patent.assignees?.[0]?.assignee_organization;

  return inventors
    .filter((inventor) => nameMatchesQuery(inventorFullName(inventor), query))
    .map((inventor, index) => {
      const fullName = inventorFullName(inventor);
      const cityState = [inventor.inventor_city, inventor.inventor_state]
        .filter(Boolean)
        .join(", ");
      return {
        id: `p_uspto_patent_${slugify(fullName)}_${patent.patent_number}_${index}`,
        fullName,
        ageRange: "Unknown",
        confidence: "Low",
        aliases: [
          `Patent: ${title}`,
          `Patent number: ${patent.patent_number}`,
          assignee ? `Assignee: ${assignee}` : "",
          cityState ? `Inventor location: ${cityState}` : "",
        ].filter(Boolean),
        locations: [
          {
            city: "USPTO Patents",
            state: "Global",
            kind: "patent inventor context",
            sourceId,
          },
        ],
        contacts: [],
        relationships: [],
        sourceRecord: {
          sourceId,
          sourceRecordId: `${patent.patent_number}:${index}`,
          raw: { patent, matchedInventor: inventor },
        },
      };
    });
}

function splitQueryName(query: string) {
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return { firstName: "", lastName: "" };
  }
  return {
    lastName: tokens[tokens.length - 1],
    firstName: tokens.slice(0, -1).join(" "),
  };
}

function inventorFullName(inventor: PatentsViewInventor) {
  return [inventor.inventor_first_name, inventor.inventor_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type PatentsViewResponse = {
  patents?: PatentsViewPatent[];
};

export type PatentsViewPatent = {
  patent_number?: string;
  patent_title?: string;
  inventors?: PatentsViewInventor[];
  assignees?: Array<{ assignee_organization?: string }>;
};

type PatentsViewInventor = {
  inventor_first_name?: string;
  inventor_last_name?: string;
  inventor_city?: string;
  inventor_state?: string;
};
