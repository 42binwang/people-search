import { createHash } from "crypto";
import {
  checkRateLimit,
  type RateLimitResult,
} from "@/lib/db";

export type RateLimitPolicy = {
  route: string;
  limit: number;
  windowMs: number;
};

export type RequestRateLimitResult = RateLimitResult & {
  limit: number;
};

export const RATE_LIMIT_POLICIES = {
  search: {
    route: "search",
    limit: 20,
    windowMs: 60_000,
  },
  searchResultsData: {
    route: "search_results_data",
    limit: 60,
    windowMs: 60_000,
  },
  recordFeedback: {
    route: "record_feedback",
    limit: 30,
    windowMs: 60_000,
  },
  privacyRequests: {
    route: "privacy_requests",
    limit: 5,
    windowMs: 10 * 60_000,
  },
  abuseReports: {
    route: "abuse_reports",
    limit: 10,
    windowMs: 10 * 60_000,
  },
} satisfies Record<string, RateLimitPolicy>;

export function checkRequestRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  nowMs?: number,
): RequestRateLimitResult {
  const result = checkRateLimit({
    bucketKey: createRateLimitBucketKey(
      policy.route,
      getClientIdentifier(request),
    ),
    route: policy.route,
    limit: policy.limit,
    windowMs: policy.windowMs,
    nowMs,
  });

  return {
    ...result,
    limit: policy.limit,
  };
}

export function rateLimitHeaders(result: RequestRateLimitResult) {
  const headers = new Headers();
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(result.remaining));
  headers.set("RateLimit-Reset", String(Math.ceil(result.resetAtMs / 1000)));
  if (!result.allowed) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return headers;
}

export function createRateLimitBucketKey(route: string, clientIdentifier: string) {
  return createHash("sha256")
    .update(`${route}:${clientIdentifier}`)
    .digest("hex");
}

export function getClientIdentifier(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwarded = forwardedFor?.split(",")[0]?.trim();
  return (
    firstForwarded ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local"
  );
}
