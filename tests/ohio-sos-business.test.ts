import { describe, expect, it } from "vitest";
import { mapOhioSosBusinessRowToProfileInput } from "@/lib/sources/ohio-sos-business";

describe("Ohio SoS business mapping", () => {
  it("maps a registered agent with a business address", () => {
    const profile = mapOhioSosBusinessRowToProfileInput(
      {
        BUSINESS_NUMBER: "1234567",
        BUSINESS_NAME: "Example LLC",
        AGENT_NAME: "Jordan Lee",
        AGENT_TYPE: "Statutory Agent",
        AGENT_ADDRESS1: "50 Office Pkwy",
        AGENT_CITY: "Columbus",
        AGENT_STATE: "OH",
        AGENT_ZIP: "43215",
      },
      "",
    );

    expect(profile?.fullName).toBe("Jordan Lee");
    expect(profile?.aliases).toContain("Ohio business: Example LLC");
    expect(profile?.aliases).toContain("Role: Statutory Agent");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Columbus",
      state: "OH",
      kind: "Ohio business/registered-agent address",
    });
  });

  it("filters to the query name when provided", () => {
    const row = { AGENT_NAME: "Jordan Lee", BUSINESS_NAME: "Co", AGENT_CITY: "Columbus", AGENT_STATE: "OH" };
    expect(mapOhioSosBusinessRowToProfileInput(row, "Jordan Lee")).not.toBeNull();
    expect(mapOhioSosBusinessRowToProfileInput(row, "Nobody Match")).toBeNull();
  });

  it("skips rows without an agent/officer name", () => {
    expect(
      mapOhioSosBusinessRowToProfileInput(
        { BUSINESS_NAME: "No Agent LLC", BUSINESS_NUMBER: "9" },
        "",
      ),
    ).toBeNull();
  });
});
