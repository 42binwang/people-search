import { upsertApprovedSource, upsertProfile } from "@/lib/db";

export type NppesIngestInput = {
  npi?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  limit?: number;
};

export type NppesIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "cms_nppes_npi_registry";

export async function ingestNppes(input: NppesIngestInput): Promise<NppesIngestResult> {
  registerNppesSource();

  const url = buildUrl({
    npi: input.npi,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    city: input.city ?? "",
    state: input.state ?? "",
    limit: Math.min(input.limit ?? 10, 50),
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchNppesIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`NPPES request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as NppesResponse;
  const results = payload.results ?? [];
  let imported = 0;

  for (const result of results) {
    if (result.enumeration_type !== "NPI-1" || result.basic.status !== "A") {
      continue;
    }

    const fullName = toFullName(result.basic);
    if (!fullName) {
      continue;
    }

    const addresses = result.addresses
      .filter((address) => address.country_code === "US")
      .map((address) => ({
        street: [address.address_1, address.address_2].filter(Boolean).join(" "),
        city: titleCase(address.city),
        state: address.state,
        zip: formatZip(address.postal_code),
        kind:
          address.address_purpose === "LOCATION"
            ? "professional location"
            : "professional mailing",
        sourceId,
      }));

    const contacts = unique(
      result.addresses
        .map((address) => address.telephone_number)
        .filter((value): value is string => Boolean(value)),
    ).map((value) => ({
      type: "phone" as const,
      value,
      confidence: "Medium",
      sourceId,
    }));

    upsertProfile({
      id: `p_nppes_${result.number}`,
      fullName,
      ageRange: "Unknown",
      confidence: "High",
      aliases: [
        ...toOtherNames(result.other_names ?? []),
        ...taxonomyAliases(result.taxonomies ?? []),
      ],
      locations: addresses,
      contacts,
      relationships: [],
      sourceRecord: {
        sourceId,
        sourceRecordId: String(result.number),
        raw: result,
      },
    });

    imported += 1;
  }

  return {
    fetched: results.length,
    imported,
    url,
  };
}

export function registerNppesSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "CMS NPPES NPI Registry API",
    category: "Professional provider registry",
    jurisdiction: "United States",
    acquisitionMethod: "official_api",
    licenseUrl: "https://npiregistry.cms.hhs.gov/api-page",
    notes:
      "Official CMS API exposing FOIA-disclosable NPPES health care provider data. Use as professional/business directory data, not residential data.",
  });
}

function buildUrl(input: {
  npi?: string;
  firstName: string;
  lastName: string;
  city: string;
  state: string;
  limit: number;
}) {
  const url = new URL("https://npiregistry.cms.hhs.gov/api/");
  url.searchParams.set("version", "2.1");

  if (input.npi) {
    url.searchParams.set("number", input.npi);
  } else {
    if (input.firstName) {
      url.searchParams.set("first_name", input.firstName);
    }
    url.searchParams.set("last_name", input.lastName);
    if (input.city) {
      url.searchParams.set("city", input.city);
    }
    if (input.state) {
      url.searchParams.set("state", input.state.toUpperCase());
    }
    url.searchParams.set("limit", String(input.limit));
  }

  return url.toString();
}

function toFullName(basic: NppesBasic) {
  if (basic.name) {
    return titleCase(basic.name);
  }

  return titleCase(
    [
      basic.first_name,
      basic.middle_name,
      basic.last_name,
      basic.name_suffix,
    ]
      .filter(isRealValue)
      .join(" "),
  );
}

function toOtherNames(names: NppesOtherName[]) {
  return unique(
    names
      .map((name) =>
        titleCase(
          [
            name.first_name,
            name.middle_name,
            name.last_name,
            name.suffix,
          ]
            .filter(isRealValue)
            .join(" "),
        ),
      )
      .filter(Boolean),
  );
}

function taxonomyAliases(taxonomies: NppesTaxonomy[]) {
  const primary = taxonomies.find((taxonomy) => taxonomy.primary);
  return primary?.desc ? [`Professional category: ${primary.desc}`] : [];
}

function formatZip(value?: string) {
  if (!value) {
    return undefined;
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }
  return digits || undefined;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bIi\b/g, "II")
    .replace(/\bIii\b/g, "III")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isRealValue(value?: string) {
  return Boolean(value && value.trim() && value.trim() !== "--");
}

type NppesResponse = {
  result_count?: number;
  results?: NppesResult[];
};

type NppesResult = {
  number: number;
  enumeration_type: string;
  basic: NppesBasic;
  addresses: NppesAddress[];
  other_names?: NppesOtherName[];
  taxonomies?: NppesTaxonomy[];
};

type NppesBasic = {
  status: string;
  name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  name_suffix?: string;
};

type NppesAddress = {
  address_1?: string;
  address_2?: string;
  address_purpose: string;
  city: string;
  country_code: string;
  postal_code?: string;
  state: string;
  telephone_number?: string;
};

type NppesOtherName = {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
};

type NppesTaxonomy = {
  desc?: string;
  primary?: boolean;
};

