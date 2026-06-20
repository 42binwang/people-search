import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS,
  DEFAULT_NAME_SOURCE_REFRESH_TTL_MS,
  formatNameSourceRefreshNotice,
  getNameSourceRefreshTimeoutMs,
  getNameSourceRefreshTtlMs,
  refreshNameSearchSources,
  type NameSourceRefreshSummary,
} from "@/lib/name-source-refresh";
import { createSearchCacheKey } from "@/lib/search-cache";
import { getDb } from "@/lib/db";

describe("name source refresh helpers", () => {
  it("defaults source refresh ttl to one day", () => {
    expect(getNameSourceRefreshTtlMs()).toBe(DEFAULT_NAME_SOURCE_REFRESH_TTL_MS);
    expect(getNameSourceRefreshTtlMs("86400")).toBe(1000 * 60 * 60 * 24);
    expect(getNameSourceRefreshTtlMs("0")).toBe(DEFAULT_NAME_SOURCE_REFRESH_TTL_MS);
    expect(getNameSourceRefreshTtlMs("not-a-number")).toBe(
      DEFAULT_NAME_SOURCE_REFRESH_TTL_MS,
    );
  });

  it("defaults per-source refresh timeout to fifteen seconds", () => {
    expect(getNameSourceRefreshTimeoutMs()).toBe(
      DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS,
    );
    expect(getNameSourceRefreshTimeoutMs("2.5")).toBe(2500);
    expect(getNameSourceRefreshTimeoutMs("0")).toBe(
      DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS,
    );
  });

  it("formats refresh summaries for the results page", () => {
    const summary = {
      refreshed: [
        {
          sourceId: "cms_nppes_npi_registry",
          label: "CMS NPPES",
          status: "refreshed",
          fetched: 2,
          imported: 2,
        },
      ],
      skipped: [
        {
          sourceId: "openalex_authors",
          label: "OpenAlex",
          status: "skipped",
          fetched: 1,
          imported: 1,
        },
      ],
      failed: [],
      totalImported: 2,
    } satisfies NameSourceRefreshSummary;

    expect(formatNameSourceRefreshNotice(summary)).toBe(
      "Checked approved sources: 1 source(s) refreshed, 1 still fresh; imported 2 profile(s).",
    );
  });

  it("suppresses the notice when no source changed (fully cached repeat)", () => {
    const cached: NameSourceRefreshSummary = {
      refreshed: [],
      skipped: [
        {
          sourceId: "openalex_authors",
          label: "OpenAlex",
          status: "skipped",
          fetched: 1,
          imported: 1,
        },
      ],
      failed: [],
      totalImported: 0,
    };

    expect(formatNameSourceRefreshNotice(cached)).toBeNull();
  });

  it("still shows the notice when only a failure occurred", () => {
    expect(
      formatNameSourceRefreshNotice({
        refreshed: [],
        skipped: [],
        failed: [
          { sourceId: "x", label: "X", status: "failed", fetched: 0, imported: 0 },
        ],
        totalImported: 0,
      }),
    ).toContain("1 unavailable");
  });
});

describe("refreshNameSearchSources cache behavior", () => {
  const cachePayload = {
    mode: "name" as const,
    firstName: "Cachecheck",
    lastName: "Tests",
    city: "",
    state: "",
  };
  const cacheQueryKey = createSearchCacheKey(cachePayload);
  const DAY_MS = 1000 * 60 * 60 * 24;
  const NOW = 1_700_000_000_000;

  function seedRefresh(
    sourceId: string,
    status: "success" | "failed",
    ageMs: number,
  ) {
    getDb()
      .prepare(
        `
        INSERT INTO source_search_refreshes
          (source_id, query_key, refreshed_at_ms, status, fetched, imported, error_message)
        VALUES (?, ?, ?, ?, 0, 0, ?)
        ON CONFLICT(source_id, query_key) DO UPDATE SET
          refreshed_at_ms = excluded.refreshed_at_ms,
          status = excluded.status,
          error_message = excluded.error_message
      `,
      )
      .run(
        sourceId,
        cacheQueryKey,
        NOW - ageMs,
        status,
        status === "failed" ? "seeded failure" : null,
      );
  }

  function clearFixtures() {
    getDb()
      .prepare("DELETE FROM source_search_refreshes WHERE query_key = ?")
      .run(cacheQueryKey);
  }

  beforeEach(clearFixtures);
  afterEach(clearFixtures);

  it("skips a source refreshed inside the TTL and fetches one never refreshed", async () => {
    seedRefresh("src_fresh", "success", 1000);
    let freshCalls = 0;
    let newCalls = 0;
    const summary = await refreshNameSearchSources(cachePayload, {
      nowMs: NOW,
      ttlMs: DAY_MS,
      adapters: [
        {
          sourceId: "src_fresh",
          label: "Fresh",
          run: async () => {
            freshCalls += 1;
            return { fetched: 5, imported: 5 };
          },
        },
        {
          sourceId: "src_new",
          label: "New",
          run: async () => {
            newCalls += 1;
            return { fetched: 3, imported: 3 };
          },
        },
      ],
    });

    expect(freshCalls).toBe(0);
    expect(newCalls).toBe(1);
    expect(summary.skipped.map((s) => s.sourceId)).toContain("src_fresh");
    expect(summary.refreshed.map((s) => s.sourceId)).toContain("src_new");
  });

  it("re-fetches a source once it is older than the TTL", async () => {
    seedRefresh("src_old", "success", DAY_MS + 1000);
    let calls = 0;
    await refreshNameSearchSources(cachePayload, {
      nowMs: NOW,
      ttlMs: DAY_MS,
      adapters: [
        {
          sourceId: "src_old",
          label: "Old",
          run: async () => {
            calls += 1;
            return { fetched: 0, imported: 0 };
          },
        },
      ],
    });

    expect(calls).toBe(1);
  });

  it("does not retry a source that failed inside the TTL", async () => {
    seedRefresh("src_failed", "failed", 1000);
    let calls = 0;
    await refreshNameSearchSources(cachePayload, {
      nowMs: NOW,
      ttlMs: DAY_MS,
      adapters: [
        {
          sourceId: "src_failed",
          label: "Failed",
          run: async () => {
            calls += 1;
            return { fetched: 0, imported: 0 };
          },
        },
      ],
    });

    expect(calls).toBe(0);
  });
});
