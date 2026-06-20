import { createHash } from "crypto";
import {
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeText,
} from "@/lib/normalization";
import type { SearchPayload } from "@/lib/search-store";

export const DEFAULT_SEARCH_RESULT_CACHE_TTL_MS = 1000 * 60 * 30;
const searchResultCacheKeyVersion = 2;

export function createSearchCacheKey(payload: SearchPayload) {
  const canonical = canonicalizeSearchPayload(payload);
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 32);

  return `search_${digest}`;
}

export function getSearchResultCacheTtlMs(
  value = process.env.SEARCH_RESULT_CACHE_TTL_SECONDS,
) {
  if (!value) {
    return DEFAULT_SEARCH_RESULT_CACHE_TTL_MS;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_SEARCH_RESULT_CACHE_TTL_MS;
  }

  return Math.round(seconds * 1000);
}

export function formatCacheTtl(ms: number) {
  if (ms <= 0) {
    return "expired";
  }

  const minutes = Math.ceil(ms / 60000);
  if (minutes === 1) {
    return "about 1 minute";
  }

  return `about ${minutes} minutes`;
}

function canonicalizeSearchPayload(payload: SearchPayload) {
  if (payload.mode === "name") {
    return {
      version: searchResultCacheKeyVersion,
      mode: payload.mode,
      firstName: normalizeName(payload.firstName),
      lastName: normalizeName(payload.lastName),
      city: normalizeText(payload.city),
      state: payload.state.trim().toUpperCase(),
    };
  }

  if (payload.mode === "phone") {
    return {
      version: searchResultCacheKeyVersion,
      mode: payload.mode,
      phone: normalizePhone(payload.phone),
    };
  }

  if (payload.mode === "email") {
    return {
      version: searchResultCacheKeyVersion,
      mode: payload.mode,
      email: normalizeEmail(payload.email),
    };
  }

  return {
    version: searchResultCacheKeyVersion,
    mode: payload.mode,
    address: normalizeAddress(payload),
  };
}
