import { describe, expect, it } from "vitest";
import {
  extractSourceIdFromFile,
  findUndocumented,
  isDocumented,
} from "@/lib/source-inventory";

describe("source inventory checks", () => {
  it("extracts a sourceId from an adapter file", () => {
    expect(
      extractSourceIdFromFile(
        "buffalo-permits.ts",
        'const sourceId = "buffalo_ny_building_permits";',
      ),
    ).toMatchObject({
      stem: "buffalo-permits",
      sourceId: "buffalo_ny_building_permits",
    });
  });

  it("returns null for files without a declared sourceId (generic adapters/helpers)", () => {
    expect(
      extractSourceIdFromFile("limits.ts", "export function clampLimit() {}"),
    ).toBeNull();
    expect(
      extractSourceIdFromFile("arcgis.ts", "export function ingestArcgis(input) {}"),
    ).toBeNull();
  });

  it("treats an adapter as documented by sourceId or filename stem", () => {
    const adapter = {
      stem: "buffalo-permits",
      sourceId: "buffalo_ny_building_permits",
      file: "lib/sources/buffalo-permits.ts",
    };
    expect(
      isDocumented(adapter, "some text `lib/sources/buffalo-permits.ts` more text"),
    ).toBe(true);
    expect(isDocumented(adapter, "uses buffalo_ny_building_permits elsewhere")).toBe(
      true,
    );
    expect(isDocumented(adapter, "no mention of this source here")).toBe(false);
  });

  it("matches a display name that differs only by separators/case", () => {
    const adapter = {
      stem: "clinical-trials",
      sourceId: "clinicaltrials_gov_studies",
      file: "lib/sources/clinical-trials.ts",
    };
    expect(isDocumented(adapter, "| ClinicalTrials.gov | Implemented | ...")).toBe(
      true,
    );
    expect(isDocumented(adapter, "Stack Exchange users row")).not.toBe(true);
  });

  it("findUndocumented lists only the adapters with no doc mention", () => {
    const docs = "the docs mention nppes and github";
    const adapters = [
      {
        stem: "nppes",
        sourceId: "cms_nppes_npi_registry",
        file: "lib/sources/nppes.ts",
      },
      { stem: "orphan", sourceId: "orphan_source", file: "lib/sources/orphan.ts" },
    ];
    const undocumented = findUndocumented(adapters, docs);
    expect(undocumented).toHaveLength(1);
    expect(undocumented[0].stem).toBe("orphan");
  });
});
