import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAME_SOURCE_REFRESH_TIMEOUT_MS,
  DEFAULT_NAME_SOURCE_REFRESH_TTL_MS,
  formatNameSourceRefreshNotice,
  getNameSourceRefreshTimeoutMs,
  getNameSourceRefreshTtlMs,
  type NameSourceRefreshSummary,
} from "@/lib/name-source-refresh";

describe("name source refresh helpers", () => {
  it("defaults source refresh ttl to one hour", () => {
    expect(getNameSourceRefreshTtlMs()).toBe(DEFAULT_NAME_SOURCE_REFRESH_TTL_MS);
    expect(getNameSourceRefreshTtlMs("3600")).toBe(1000 * 60 * 60);
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
});
