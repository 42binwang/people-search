import { describe, expect, it } from "vitest";
import {
  mapUsptoTrademarkToProfileInput,
  type UsptoTrademarkRecord,
} from "@/lib/sources/uspto-trademark";

const baseRecord: UsptoTrademarkRecord = {
  ownerName: "Maria Elena Castillo",
  ownerAddress1: "1420 Oakwood Ave",
  ownerCity: "Austin",
  ownerState: "TX",
  ownerPostalCode: "78704",
  ownerCountry: "USA",
  markDescription: "CASTILLO CRAFT COFFEE",
  registrationNumber: "6123456",
  serialNumber: "90123456",
  status: "Registered",
  filingDate: "2020-03-14",
};

describe("USPTO trademark owners source mapping", () => {
  it("maps a matching individual owner to a trademark-context profile", () => {
    const profile = mapUsptoTrademarkToProfileInput(
      "Maria Castillo",
      baseRecord,
    );

    expect(profile?.id).toBe("p_uspto_trademark_maria_elena_castillo_6123456");
    expect(profile?.fullName).toBe("Maria Elena Castillo");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Low");
    expect(profile?.aliases).toContain("Trademark: CASTILLO CRAFT COFFEE");
    expect(profile?.aliases).toContain("Registration number: 6123456");
    expect(profile?.aliases).toContain("Serial number: 90123456");
    expect(profile?.aliases).toContain("Status: Registered");
    expect(profile?.aliases).toContain("Filing date: 2020-03-14");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "1420 Oakwood Ave",
      city: "Austin",
      state: "TX",
      zip: "78704",
      kind: "trademark owner/correspondence address",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "uspto_trademark_owners",
      sourceRecordId: "6123456",
    });
    expect(profile?.sourceRecord?.raw).toEqual(baseRecord);
  });

  it("falls back to serial number when registration number is absent", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ...baseRecord,
      registrationNumber: undefined,
    });

    expect(profile?.id).toBe(
      "p_uspto_trademark_maria_elena_castillo_90123456",
    );
    expect(profile?.sourceRecord?.sourceRecordId).toBe("90123456");
  });

  it("falls back to USPTO/US when address city/state are missing", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ...baseRecord,
      ownerCity: undefined,
      ownerState: undefined,
    });

    expect(profile?.locations?.[0]).toMatchObject({
      city: "USPTO",
      state: "US",
    });
  });

  it("collapses internal whitespace in the owner name", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ...baseRecord,
      ownerName: "  Maria   Elena   Castillo  ",
    });

    expect(profile?.fullName).toBe("Maria Elena Castillo");
  });

  it("omits alias entries for missing optional fields", () => {
    const profile = mapUsptoTrademarkToProfileInput("Maria Castillo", {
      ownerName: "Maria Elena Castillo",
      registrationNumber: "6123456",
    });

    expect(profile?.aliases).toEqual(["Registration number: 6123456"]);
  });

  it("filters to the queried name", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", baseRecord),
    ).not.toBeNull();
    expect(
      mapUsptoTrademarkToProfileInput("Nobody Match", baseRecord),
    ).toBeNull();
  });

  it("requires every query token to appear in the owner name", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", baseRecord),
    ).not.toBeNull();
    expect(
      mapUsptoTrademarkToProfileInput("Maria Hernandez", baseRecord),
    ).toBeNull();
  });

  it("skips records with a blank owner name", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", {
        ...baseRecord,
        ownerName: "   ",
      }),
    ).toBeNull();
  });

  it("skips records with no identifying number", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", {
        ...baseRecord,
        registrationNumber: undefined,
        serialNumber: undefined,
      }),
    ).toBeNull();
  });

  it("skips records with no owner name at all", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Maria Castillo", {
        ownerAddress1: "1420 Oakwood Ave",
        ownerCity: "Austin",
        registrationNumber: "6123456",
      }),
    ).toBeNull();
  });
});
