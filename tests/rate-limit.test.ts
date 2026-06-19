import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  checkRequestRateLimit,
  createRateLimitBucketKey,
  getClientIdentifier,
  rateLimitHeaders,
} from "@/lib/rate-limit";

describe("request rate limiting helpers", () => {
  beforeEach(() => {
    dbMocks.checkRateLimit.mockReset();
  });

  it("uses the first forwarded IP as the client identifier", () => {
    const request = new Request("http://localhost/search", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        "x-real-ip": "198.51.100.9",
      },
    });

    expect(getClientIdentifier(request)).toBe("203.0.113.10");
  });

  it("falls back to local when no client IP headers are present", () => {
    expect(getClientIdentifier(new Request("http://localhost/search"))).toBe(
      "local",
    );
  });

  it("hashes route and client identifier into a stable bucket key", () => {
    expect(createRateLimitBucketKey("search", "203.0.113.10")).toHaveLength(64);
    expect(createRateLimitBucketKey("search", "203.0.113.10")).toBe(
      createRateLimitBucketKey("search", "203.0.113.10"),
    );
    expect(createRateLimitBucketKey("feedback", "203.0.113.10")).not.toBe(
      createRateLimitBucketKey("search", "203.0.113.10"),
    );
  });

  it("passes route policy and hashed client key to the database limiter", () => {
    dbMocks.checkRateLimit.mockReturnValue({
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
      resetAtMs: 1000,
    });

    const result = checkRequestRateLimit(
      new Request("http://localhost/search", {
        headers: {
          "x-real-ip": "203.0.113.10",
        },
      }),
      {
        route: "search",
        limit: 20,
        windowMs: 60_000,
      },
      123,
    );

    expect(result).toMatchObject({
      allowed: true,
      limit: 20,
      remaining: 19,
    });
    expect(dbMocks.checkRateLimit).toHaveBeenCalledWith({
      bucketKey: createRateLimitBucketKey("search", "203.0.113.10"),
      route: "search",
      limit: 20,
      windowMs: 60_000,
      nowMs: 123,
    });
  });

  it("formats rate limit headers including Retry-After when denied", () => {
    const headers = rateLimitHeaders({
      allowed: false,
      limit: 20,
      remaining: 0,
      retryAfterSeconds: 17,
      resetAtMs: 123_456,
    });

    expect(headers.get("RateLimit-Limit")).toBe("20");
    expect(headers.get("RateLimit-Remaining")).toBe("0");
    expect(headers.get("RateLimit-Reset")).toBe("124");
    expect(headers.get("Retry-After")).toBe("17");
  });
});
