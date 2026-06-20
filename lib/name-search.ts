import { escapeSqlLike, normalizeName } from "@/lib/normalization";
import type { SearchPayload } from "@/lib/search-store";

export type NameSearchPayload = Extract<SearchPayload, { mode: "name" }>;

export function getNameSearchTokens(payload: NameSearchPayload) {
  const firstTokens = tokenizeName(payload.firstName);
  const lastTokens = tokenizeName(payload.lastName);
  const requiredTokens =
    firstTokens.length > 0 ? [...firstTokens, ...lastTokens] : lastTokens;

  return unique(requiredTokens);
}

export function nameTokenLikePattern(token: string) {
  return `% ${escapeSqlLike(token)} %`;
}

export function normalizedNameMatchesTokens(value: string, tokens: string[]) {
  const candidateTokens = new Set(tokenizeName(value));
  return tokens.every((token) => candidateTokens.has(token));
}

export function isPersonLikeSearchName(value: string, requiredTokens: string[]) {
  const tokens = tokenizeName(value);
  const alphaTokens = tokens.filter((token) => /[a-z]/.test(token));

  if (tokens.length < 2 || tokens.length > 6 || alphaTokens.length < 2) {
    return false;
  }

  if (tokens.some((token) => /\d/.test(token))) {
    return false;
  }

  if (!requiredTokens.every((token) => tokens.includes(token))) {
    return false;
  }

  return true;
}

export function tokenizeName(value: string) {
  return normalizeName(value).split(" ").filter(Boolean);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
