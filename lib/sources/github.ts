import {
  upsertApprovedSource,
  upsertProfile,
  type UpsertProfileInput,
} from "@/lib/db";
import { normalizeName } from "@/lib/normalization";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

export type GitHubIngestInput = {
  query: string;
  limit?: number;
  token?: string;
};

export type GitHubIngestResult = {
  fetched: number;
  imported: number;
  url: string;
};

const sourceId = "github_users";

export async function ingestGitHubUsers(
  input: GitHubIngestInput,
): Promise<GitHubIngestResult> {
  registerGitHubSource();

  const limit = clampLimit(input.limit, 30);
  const token = input.token || process.env.GITHUB_TOKEN;
  const url = buildGitHubSearchUrl({
    query: input.query,
    limit,
  });

  const response = await fetch(url, {
    headers: githubHeaders(token),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GitHubSearchResponse;
  const users = applyImportLimit(payload.items ?? [], limit);
  let imported = 0;

  for (const user of users) {
    const detail = await fetchGitHubUser(user.login, token);
    const profile = mapGitHubUserToProfileInput(input.query, detail ?? user);
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

export function registerGitHubSource() {
  upsertApprovedSource({
    id: sourceId,
    name: "GitHub REST API User Search",
    category: "Public developer profile",
    jurisdiction: "Global",
    acquisitionMethod: "official_api",
    licenseUrl: "https://docs.github.com/rest",
    notes:
      "GitHub REST API public user data. Use as public developer profile context only; user-entered profile fields are not verified identity, contact, or residential evidence.",
  });
}

export function mapGitHubUserToProfileInput(
  query: string,
  user: GitHubUser,
): UpsertProfileInput | null {
  const displayName = user.name || user.login;
  if (!user.login || !displayName || !nameMatchesQuery(displayName, query)) {
    return null;
  }

  return {
    id: `p_github_${slugify(user.login)}`,
    fullName: displayName,
    ageRange: "Unknown",
    confidence: user.name ? "Medium" : "Low",
    aliases: [
      `GitHub username: ${user.login}`,
      user.html_url ? `GitHub profile: ${user.html_url}` : "",
      user.company ? `Company: ${user.company}` : "",
      user.blog ? `Website: ${user.blog}` : "",
      typeof user.public_repos === "number"
        ? `Public repositories: ${user.public_repos}`
        : "",
      typeof user.followers === "number" ? `Followers: ${user.followers}` : "",
    ].filter(Boolean),
    locations: [
      {
        city: user.location || "GitHub",
        state: user.location ? "User-entered" : "Global",
        kind: "public developer profile",
        sourceId,
      },
    ],
    contacts: [],
    relationships: [],
    sourceRecord: {
      sourceId,
      sourceRecordId: user.login,
      raw: user,
    },
  };
}

async function fetchGitHubUser(login: string, token?: string) {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as GitHubUser;
}

function buildGitHubSearchUrl(input: { query: string; limit: number | undefined }) {
  const url = new URL("https://api.github.com/search/users");
  url.searchParams.set("q", `${input.query} in:name`);
  url.searchParams.set("type", "Users");
  if (input.limit) {
    url.searchParams.set("per_page", String(input.limit));
  }
  return url.toString();
}

function githubHeaders(token?: string) {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "PeopleSearchGitHubIngest/0.1 local-development",
    "x-github-api-version": "2022-11-28",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

function nameMatchesQuery(name: string, query: string) {
  const nameNorm = normalizeName(name);
  const tokens = normalizeName(query).split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => nameNorm.includes(token));
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "_") || "unknown";
}

type GitHubSearchResponse = {
  items?: GitHubUser[];
};

export type GitHubUser = {
  login: string;
  id?: number;
  name?: string | null;
  html_url?: string;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  public_repos?: number;
  followers?: number;
};
