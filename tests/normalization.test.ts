import { describe, expect, it } from "vitest";
import {
  escapeSqlLike,
  maskEmail,
  normalizeAddress,
  normalizeName,
  normalizePhone,
} from "@/lib/normalization";

describe("normalization helpers", () => {
  it("normalizes names for search", () => {
    expect(normalizeName("  José   O'Neil-Smith  ")).toBe("jose o neil smith");
  });

  it("normalizes US phone numbers to E.164", () => {
    expect(normalizePhone("(512) 555-0148")).toBe("+15125550148");
    expect(normalizePhone("1-972-555-2291")).toBe("+19725552291");
    expect(normalizePhone("555")).toBe("");
  });

  it("normalizes address parts", () => {
    expect(
      normalizeAddress({
        street: "100 Main St.",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
    ).toBe("100 main st austin tx 78701");
  });

  it("escapes SQL LIKE wildcard characters", () => {
    expect(escapeSqlLike("100%_main\\street")).toBe("100\\%\\_main\\\\street");
  });

  it("masks email local parts", () => {
    expect(maskEmail("avery.chen@example.test")).toBe("av********@example.test");
  });
});
