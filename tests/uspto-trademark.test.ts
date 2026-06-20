import { describe, expect, it } from "vitest";
import { mapUsptoTrademarkToProfileInput } from "@/lib/sources/uspto-trademark";

const record = {
  ownerName: "Jordan Lee",
  ownerAddress1: "500 Example St",
  ownerCity: "Austin",
  ownerState: "TX",
  ownerPostalCode: "78701",
  markDescription: "EXAMPLECO",
  registrationNumber: "1234567",
  serialNumber: "7654321",
  status: "Registered",
  filingDate: "2020-01-15",
};

describe("USPTO trademark owners source mapping", () => {
  it("maps a matching owner to a trademark-context profile", () => {
    const profile = mapUsptoTrademarkToProfileInput("Jordan Lee", record);

    expect(profile?.id).toBe("p_uspto_trademark_jordan_lee_1234567");
    expect(profile?.fullName).toBe("Jordan Lee");
    expect(profile?.aliases).toContain("Trademark: EXAMPLECO");
    expect(profile?.aliases).toContain("Registration number: 1234567");
    expect(profile?.aliases).toContain("Status: Registered");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Austin",
      state: "TX",
      street: "500 Example St",
      kind: "trademark owner/correspondence address",
    });
    expect(profile?.contacts).toEqual([]);
  });

  it("skips records whose owner does not match the query", () => {
    expect(mapUsptoTrademarkToProfileInput("Nobody Match", record)).toBeNull();
  });

  it("skips records without an identifying number", () => {
    expect(
      mapUsptoTrademarkToProfileInput("Jordan Lee", {
        ...record,
        registrationNumber: undefined,
        serialNumber: undefined,
      }),
    ).toBeNull();
  });
});
