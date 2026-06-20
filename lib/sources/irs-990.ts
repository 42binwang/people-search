import { readFileSync } from "fs";
import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";

export type Irs990IngestInput = {
  /** Path to a downloaded IRS Form 990 XML file (bulk/officer extraction model). */
  file: string;
  /** Optional person name; when set, only officers matching it become profiles. */
  query?: string;
  /** Nonprofit name to attach as context (falls back to a value parsed from the filing). */
  organizationName?: string;
};

export type Irs990IngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "irs_form_990_officers";

// IRS Form 990 officers/directors are NOT queryable by person name via any
// public API; they live in Part VII of each e-filed 990 return. This adapter
// extracts officers from a 990 XML file (bulk/officer model). Officer records
// carry the nonprofit's business address, not a residence. Live scaling
// (downloading the IRS 990 index) is out of scope; pass downloaded XML files.
export async function ingestIrs990OfficersFromFile(
  input: Irs990IngestInput,
): Promise<Irs990IngestResult> {
  registerIrs990Source();

  const xml = readFileSync(input.file, "utf8");
  const filing = parseIrs990Filing(xml);
  const organizationName = input.organizationName || filing.organizationName;

  const profiles = mapIrs990OfficersToProfileInputs(
    input.query ?? "",
    filing.officers,
    { organizationName, businessAddress: filing.businessAddress },
  );

  for (const profile of profiles) {
    upsertProfile(profile);
  }

  return {
    fetched: filing.officers.length,
    imported: profiles.length,
    url: input.file,
  };
}

export function registerIrs990Source() {
  upsertApprovedSource({
    id: sourceId,
    name: "IRS Form 990 Officers",
    category: "Nonprofit officer/director",
    jurisdiction: "United States",
    acquisitionMethod: "official_bulk",
    licenseUrl:
      "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search-bulk-data",
    notes:
      "IRS Form 990 e-file data (public record). Use as nonprofit officer/director context only; the address is the organization's business address, not an officer's residence.",
  });
}

export type Irs990Officer = {
  name: string;
  title?: string;
  compensation?: string;
};

export type Irs990Filing = {
  organizationName: string;
  businessAddress: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  officers: Irs990Officer[];
};

export function parseIrs990Filing(xml: string): Irs990Filing {
  return {
    organizationName: firstTagText(xml, "BusinessNameLine1Txt"),
    businessAddress: {
      street: firstTagText(xml, "AddressLine1Txt") || undefined,
      city: firstTagText(xml, "CityNm") || undefined,
      state: firstTagText(xml, "StateAbbreviationCd") || undefined,
      zip: firstTagText(xml, "ZIPCd") || undefined,
    },
    officers: extractOfficerBlocks(xml).map((block) => ({
      name: officerName(block),
      title: firstTagText(block, "TitleTxt") || undefined,
      compensation:
        firstTagText(block, "ReportableCompFromOrgAmt") || undefined,
    })),
  };
}

export function mapIrs990OfficersToProfileInputs(
  query: string,
  officers: Irs990Officer[],
  context: { organizationName?: string; businessAddress: Irs990Filing["businessAddress"] },
): UpsertProfileInput[] {
  return officers
    .filter((officer) => officer.name)
    .filter((officer) => !query || nameMatchesQuery(officer.name, query))
    .map((officer, index) => {
      const address = context.businessAddress;
      return {
        id: `p_irs_990_${slugify(officer.name)}_${index}`,
        fullName: officer.name,
        ageRange: "Unknown",
        confidence: "Low",
        aliases: [
          context.organizationName
            ? `Nonprofit officer of: ${context.organizationName}`
            : "",
          officer.title ? `Title: ${officer.title}` : "",
          officer.compensation
            ? `Reportable compensation: $${Number(officer.compensation).toLocaleString()}`
            : "",
        ].filter(Boolean),
        locations: [
          {
            city: address.city || "IRS Form 990",
            state: address.state || "US",
            street: address.street,
            zip: address.zip,
            kind: "nonprofit business address",
            sourceId,
          },
        ],
        contacts: [],
        relationships: [],
        sourceRecord: {
          sourceId,
          sourceRecordId: `${slugify(officer.name)}_${index}`,
          raw: { officer, organization: context.organizationName },
        },
      };
    });
}

function extractOfficerBlocks(xml: string): string[] {
  return Array.from(
    xml.matchAll(/<Form990PartVIISectionAGrp>([\s\S]*?)<\/Form990PartVIISectionAGrp>/g),
  ).map((match) => match[1]);
}

function officerName(block: string): string {
  const first = firstTagText(block, "PersonFirstNameTxt");
  const last = firstTagText(block, "PersonLastNameTxt");
  if (first || last) {
    return [first, last].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  // Organization/unnamed officers fall back to a business name line if present.
  return firstTagText(block, "BusinessNameLine1Txt");
}

function firstTagText(xml: string, tagName: string) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? decodeXml(match[1]).trim() : "";
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}
