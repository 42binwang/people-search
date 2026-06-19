import { describe, expect, it } from "vitest";
import { applyImportLimit, clampLimit } from "@/lib/sources/limits";

describe("source ingest limit helpers", () => {
  it("normalizes optional limits before adapters apply them", () => {
    expect(clampLimit(undefined, 100)).toBeUndefined();
    expect(clampLimit(Number.NaN, 100)).toBeUndefined();
    expect(clampLimit(0, 100)).toBe(1);
    expect(clampLimit(10.8, 100)).toBe(10);
    expect(clampLimit(500, 100)).toBe(100);
  });

  it("applies local import limits without mutating source rows", () => {
    const rows = ["a", "b", "c"];

    expect(applyImportLimit(rows, undefined)).toEqual(rows);
    expect(applyImportLimit(rows, 2)).toEqual(["a", "b"]);
    expect(rows).toEqual(["a", "b", "c"]);
  });
});
