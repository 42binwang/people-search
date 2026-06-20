import { describe, expect, it } from "vitest";
import { mapNycAcrisPartyToProfileInput } from "@/lib/sources/nyc-acris-deeds";

describe("NYC ACRIS deeds source mapping", () => {
  it("maps a grantor party (LAST, FIRST) to a context profile with party address", () => {
    const profile = mapNycAcrisPartyToProfileInput(
      {
        document_id: "2008091000033001",
        record_type: "P",
        party_type: "1",
        name: "SMITH, JANE Q",
        address_1: "123 EXAMPLE ST",
        city: "NEW YORK",
        state: "NY",
        zip: "10019",
        country: "US",
      },
      "Jane Q Smith",
    );

    expect(profile?.id).toBe("p_acris_jane_q_smith");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.aliases).toContain("Party role: grantor (seller)");
    expect(profile?.sourceRecord?.sourceId).toBe("nyc_acris_deeds");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "2008091000033001__jane_q_smith",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({ matchedParty: "Jane Q Smith" });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "NEW YORK",
      state: "NY",
      kind: "property record",
    });
  });

  it("falls back to the recorded property address when the party has no mailing city/state", () => {
    const profile = mapNycAcrisPartyToProfileInput(
      {
        document_id: "2026040300428001",
        party_type: "2",
        name: "3111 LLC",
      },
      "3111 LLC",
      {
        document_id: "2026040300428001",
        borough: "4",
        block: "11653",
        lot: "50",
        street_number: "114-29",
        street_name: "126 STREET",
      },
    );

    expect(profile?.fullName).toBe("3111 LLC");
    expect(profile?.aliases).toContain("Party role: grantee (buyer)");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "New York",
      state: "NY",
      kind: "property record",
    });
  });

  it("skips parties without any name", () => {
    expect(
      mapNycAcrisPartyToProfileInput(
        { party_type: "1", name: "" },
        "",
      ),
    ).toBeNull();
  });
});
