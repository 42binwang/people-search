import { describe, expect, it } from "vitest";
import { mapFaaAirmenRowToProfileInput } from "@/lib/sources/faa-airmen";

describe("FAA airmen mapping", () => {
  it("maps an airman with a disclosed mailing address", () => {
    const profile = mapFaaAirmenRowToProfileInput(
      {
        UNIQUE_INSP_ID: "A1234567",
        FIRST_NAME: "Jordan",
        LAST_NAME: "Lee",
        STREET1: "1500 Aviation Dr",
        CITY: "Austin",
        STATE: "TX",
        ZIP_CODE: "78701",
        CERT_TYPE: "Private Pilot",
      },
      "",
    );

    expect(profile?.fullName).toBe("Jordan Lee");
    expect(profile?.aliases).toContain("Airman certificate: Private Pilot");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "1500 Aviation Dr",
      city: "Austin",
      state: "TX",
      kind: "FAA airman mailing address",
    });
  });

  it("suppresses the address when the airman opted out (no fabricated address)", () => {
    const profile = mapFaaAirmenRowToProfileInput(
      {
        UNIQUE_INSP_ID: "B7654321",
        FIRST_NAME: "Alex",
        LAST_NAME: "Rivera",
        CITY: "",
        STATE: "",
        STREET1: "",
      },
      "",
    );

    expect(profile?.fullName).toBe("Alex Rivera");
    expect(profile?.locations).toEqual([]);
    expect(profile?.aliases).toContain("Address withheld (airman opt-out)");
  });

  it("filters airmen to the query name when provided", () => {
    const row = { FIRST_NAME: "Jordan", LAST_NAME: "Lee", CITY: "Austin", STATE: "TX" };
    expect(mapFaaAirmenRowToProfileInput(row, "Jordan Lee")).not.toBeNull();
    expect(mapFaaAirmenRowToProfileInput(row, "Nobody Match")).toBeNull();
  });
});
