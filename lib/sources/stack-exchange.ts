import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type StackExchangeIngestInput = {
  query: string;
  site?: string;
  limit?: number;
};

export type StackExchangeIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "stackexchange_users";

export async function ingestStackExchangeUsers(
  input: StackExchangeIngestInput,
): Promise<StackExchangeIngestResult> {
  registerStackExchangeSource();

  const limit = clampLimit(input.limit, 100);
  const site = input.site || "stackoverflow";
  const url = buildStackExchangeUsersUrl({
    query: input.query,
    site,
    limit,
  });

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "PeopleSearchStackExchangeIngest/0.1 local-development",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Stack Exchange request failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as StackExchangeUsersResponse;
  const users = applyImportLimit(payload.items ?? [], limit);
  let imported = 0;

  for (const user of users) {
    const profile = mapStackExchangeUserToProfileInput(input.query, site, user);
    if (!profile) {
      continue;
    }

    upsertProfile(profile);
    imported += 1;
  }

  return {
    fetched: users.length,
    imported,
    url,
  };
}

export function registerStackExchangeSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "Stack Exchange API Users",
    category: "Public Q&A profile",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://api.stackexchange.com/docs",
    notes:
      "Stack Exchange API public user data. Use as public Q&A profile context only; display names and locations are user-entered and not verified identity/contact evidence.",
  });
}

export function mapStackExchangeUserToProfileInput(
  query: string,
  site: string,
  user: StackExchangeUser,
): UpsertProfileInput | null {
  if (
    typeof user.user_id !== "number" ||
    !user.display_name ||
    !nameMatchesQuery(user.display_name, query)
  ) {
    return null;
  }

  return {
    id: `p_stackexchange_${site}_${user.user_id}`,
    fullName: user.display_name,
    ageRange: "Unknown",
    confidence: "Low",
    aliases: [
      `Stack Exchange site: ${site}`,
      user.link ? `Profile: ${user.link}` : "",
      typeof user.reputation === "number" ? `Reputation: ${user.reputation}` : "",
      typeof user.account_id === "number" ? `Network account: ${user.account_id}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: user.location || `Stack Exchange:${site}`,
        state: user.location ? "User-entered" : "Global",
        kind: "public Q&A profile",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: `${site}:${user.user_id}`,
      raw: user,
    },
  };
}

function buildStackExchangeUsersUrl(input: {
  query: string;
  site: string;
  limit: number | undefined;
}) {
  const url = new URL("https://api.stackexchange.com/2.3/users");
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "reputation");
  url.searchParams.set("inname", input.query);
  url.searchParams.set("site", input.site);
  if (input.limit) {
    url.searchParams.set("pagesize", String(input.limit));
  }
  return url.toString();
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

type StackExchangeUsersResponse = {
  items?: StackExchangeUser[];
};

export type StackExchangeUser = {
  user_id?: number;
  account_id?: number;
  display_name?: string;
  location?: string;
  link?: string;
  reputation?: number;
};
