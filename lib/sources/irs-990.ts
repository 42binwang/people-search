import { readFileSync } from "fs";
import { inflateRawSync } from "node:zlib";
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

export type Irs990ZipIngestInput = {
  /** Path to an IRS TEOS monthly Form 990 series ZIP containing XML returns. */
  zipFile: string;
  /** Optional person name; when set, only officers matching it become profiles. */
  query?: string;
  /** Optional cap on imported officer profiles. */
  limit?: number;
  /** Optional cap on XML files processed from the ZIP. */
  maxFiles?: number;
};

export type Irs990ZipIngestResult = Irs990IngestResult & {
  files: number;
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

export async function ingestIrs990OfficersFromZip(
  input: Irs990ZipIngestInput,
): Promise<Irs990ZipIngestResult> {
  registerIrs990Source();

  const zip = readFileSync(input.zipFile);
  const entries = extractIrs990XmlEntriesFromZip(zip);
  const maxFiles = positiveInteger(input.maxFiles);
  const importLimit = positiveInteger(input.limit);
  let files = 0;
  let fetched = 0;
  let imported = 0;

  for (const entry of maxFiles ? entries.slice(0, maxFiles) : entries) {
    const filing = parseIrs990Filing(entry.xml);
    files += 1;
    fetched += filing.officers.length;

    const profiles = mapIrs990OfficersToProfileInputs(
      input.query ?? "",
      filing.officers,
      {
        organizationName: filing.organizationName,
        businessAddress: filing.businessAddress,
        sourceRecordPrefix: slugify(entry.name),
      },
    );
    const remaining = importLimit ? importLimit - imported : undefined;
    const selectedProfiles =
      remaining === undefined ? profiles : profiles.slice(0, remaining);

    for (const profile of selectedProfiles) {
      upsertProfile(profile);
    }

    imported += selectedProfiles.length;
    if (importLimit && imported >= importLimit) {
      break;
    }
  }

  return {
    files,
    fetched,
    imported,
    url: input.zipFile,
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

export type Irs990ZipXmlEntry = {
  name: string;
  xml: string;
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
  context: {
    organizationName?: string;
    businessAddress: Irs990Filing["businessAddress"];
    sourceRecordPrefix?: string;
  },
): UpsertProfileInput[] {
  return officers
    .filter((officer) => officer.name)
    .filter((officer) => !query || nameMatchesQuery(officer.name, query))
    .map((officer, index) => {
      const address = context.businessAddress;
      const sourceRecordId = [
        context.sourceRecordPrefix,
        slugify(officer.name),
        String(index),
      ]
        .filter(Boolean)
        .join("_");
      return {
        id: `p_irs_990_${sourceRecordId}`,
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
          sourceRecordId,
          raw: { officer, organization: context.organizationName },
        },
      };
    });
}

export function extractIrs990XmlEntriesFromZip(zip: Buffer): Irs990ZipXmlEntry[] {
  const centralDirectory = findCentralDirectory(zip);
  const entries: Irs990ZipXmlEntry[] = [];
  let offset = centralDirectory.offset;

  for (let i = 0; i < centralDirectory.entries; i += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }

    const compressionMethod = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const name = zip
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");
    offset += 46 + fileNameLength + extraLength + commentLength;

    if (!name.toLowerCase().endsWith(".xml")) {
      continue;
    }
    entries.push({
      name,
      xml: inflateZipEntry(zip, {
        compressionMethod,
        compressedSize,
        localHeaderOffset,
      }).toString("utf8"),
    });
  }

  return entries;
}

function findCentralDirectory(zip: Buffer) {
  const minEndRecordSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, zip.length - minEndRecordSize - maxCommentLength);
  for (let offset = zip.length - minEndRecordSize; offset >= start; offset -= 1) {
    if (zip.readUInt32LE(offset) !== 0x06054b50) {
      continue;
    }
    return {
      entries: zip.readUInt16LE(offset + 10),
      offset: zip.readUInt32LE(offset + 16),
    };
  }
  throw new Error("ZIP central directory not found");
}

function inflateZipEntry(
  zip: Buffer,
  entry: {
    compressionMethod: number;
    compressedSize: number;
    localHeaderOffset: number;
  },
) {
  if (zip.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error("ZIP local file header not found");
  }
  const fileNameLength = zip.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = zip.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed);
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
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

function positiveInteger(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(1, Math.trunc(value));
}
