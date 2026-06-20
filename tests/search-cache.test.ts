import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_RESULT_CACHE_TTL_MS,
  createSearchCacheKey,
  formatCacheTtl,
  getSearchResultCacheTtlMs,
} from "@/lib/search-cache";

describe("search result cache helpers", () => {
  it("builds stable hashed keys from normalized name searches", () => {
    const first = createSearchCacheKey({
      mode: "name",
      firstName: " Jane ",
      lastName: "SMITH",
      city: " New   York ",
      state: "ny",
    });
    const second = createSearchCacheKey({
      mode: "name",
      firstName: "jane",
      lastName: "smith",
      city: "new york",
      state: "NY",
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^search_[a-f0-9]{32}$/);
    expect(first).not.toContain("jane");
    expect(first).not.toContain("smith");
  });

  it("builds stable keys from normalized phone searches", () => {
    expect(
      createSearchCacheKey({
        mode: "phone",
        phone: "(512) 555-0148",
      }),
    ).toBe(
      createSearchCacheKey({
        mode: "phone",
        phone: "+15125550148",
      }),
    );
  });

  it("builds stable keys from normalized email searches", () => {
    expect(
      createSearchCacheKey({
        mode: "email",
        email: "Taylor.Email@Example.com",
      }),
    ).toBe(
      createSearchCacheKey({
        mode: "email",
        email: " taylor.email@example.com ",
      }),
    );
  });

  it("uses default ttl unless a positive seconds value is configured", () => {
    expect(getSearchResultCacheTtlMs()).toBe(DEFAULT_SEARCH_RESULT_CACHE_TTL_MS);
    expect(getSearchResultCacheTtlMs("90")).toBe(90000);
    expect(getSearchResultCacheTtlMs("0")).toBe(DEFAULT_SEARCH_RESULT_CACHE_TTL_MS);
    expect(getSearchResultCacheTtlMs("not-a-number")).toBe(
      DEFAULT_SEARCH_RESULT_CACHE_TTL_MS,
    );
  });

  it("formats remaining ttl for display", () => {
    expect(formatCacheTtl(0)).toBe("expired");
    expect(formatCacheTtl(1000)).toBe("about 1 minute");
    expect(formatCacheTtl(61000)).toBe("about 2 minutes");
  });
});
