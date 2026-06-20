import { describe, expect, it } from "vitest";
import {
  decodeStatus,
  decodeTitle,
  mapFlSunbizOfficerToProfileInput,
  normalizeOfficerName,
  type FlSunbizEntity,
  type FlSunbizOfficer,
} from "@/lib/sources/fl-sunbiz";

describe("Florida Sunbiz officer source mapping", () => {
  it("maps an LLC manager officer to a context profile", () => {
    const officer: FlSunbizOfficer = {
      displayName: "Stephanie Jimenez",
      rawName: "JIMENEZ STEPHANIE",
      rawTitle: "MGR",
      title: decodeTitle("MGR"),
      slot: 1,
    };
    const entity: FlSunbizEntity = {
      corporationNumber: "L24000123456",
      corporationName: "TERRA DEL VISTA LLC",
      status: "A",
      filingType: "FLAL",
      fileDate: "20240115",
      officers: [officer],
    };

    const profile = mapFlSunbizOfficerToProfileInput(
      officer,
      entity,
      officer.displayName,
    );

    expect(profile?.id).toBe("p_sunbiz_terra_del_vista_llc__stephanie_jimenez");
    expect(profile?.fullName).toBe("Stephanie Jimenez");
    expect(profile?.aliases).toContain(
      "Last known institution: TERRA DEL VISTA LLC",
    );
    expect(profile?.aliases).toContain("Title: Manager");
    expect(profile?.aliases).toContain("Status: Active");
    expect(profile?.sourceRecord?.sourceId).toBe("fl_sunbiz_business_entities");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "terra_del_vista_llc__stephanie_jimenez",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "TERRA DEL VISTA LLC",
      state: "FL",
      kind: "business registry affiliation",
    });
    // Officer street address must NOT be carried into locations (residential).
    expect(profile?.locations?.length).toBe(1);
  });

  it("decodes corporate officer title codes and authorized-member roles", () => {
    expect(decodeTitle("P")).toBe("President");
    expect(decodeTitle("T")).toBe("Treasurer");
    expect(decodeTitle("D")).toBe("Director");
    expect(decodeTitle("MGR")).toBe("Manager");
    expect(decodeTitle("AP")).toBe("Authorized Member");
    expect(decodeTitle("AMBR")).toBe("Authorized Member");
    expect(decodeStatus("A")).toBe("Active");
    expect(decodeStatus("I")).toBe("Inactive");
  });

  it("converts last-name-first officer storage to display order", () => {
    expect(normalizeOfficerName("JONES MARY ELLEN")).toBe("Mary Ellen Jones");
    expect(normalizeOfficerName("JIMENEZ STEPHANIE")).toBe("Stephanie Jimenez");
    expect(normalizeOfficerName("SMITH")).toBe("Smith");
    expect(normalizeOfficerName("")).toBe("");
  });

  it("skips officers without a display name", () => {
    const entity: FlSunbizEntity = {
      corporationNumber: "L1",
      corporationName: "EMPTY OFFICER LLC",
      status: "A",
      filingType: "FLAL",
      officers: [],
    };
    const officer: FlSunbizOfficer = {
      displayName: "",
      rawName: "",
      rawTitle: "",
      title: "",
      slot: 1,
    };
    expect(
      mapFlSunbizOfficerToProfileInput(officer, entity, ""),
    ).toBeNull();
  });
});
