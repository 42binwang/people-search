import { describe, expect, it } from "vitest";
import {
  mapNycAcrisPartyToProfileInput,
  type AcrisLegal,
  type AcrisParty,
} from "@/lib/sources/nyc-acris-deeds";

describe("NYC ACRIS deeds source mapping", () => {
  it("maps a grantor party (LAST, FIRST) to a context profile with party address", () => {
    const party: AcrisParty = {
      document_id: "2008091000033001",
      record_type: "P",
      party_type: "1",
      name: "SMITH, JANE Q",
      address_1: "123 EXAMPLE ST",
      city: "NEW YORK",
      state: "NY",
      zip: "10019",
      country: "US",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Jane Q Smith");

    expect(profile?.id).toBe("p_acris_jane_q_smith");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain("Party role: grantor (seller)");
    expect(profile?.sourceRecord?.sourceId).toBe("nyc_acris_deeds");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "2008091000033001__jane_q_smith",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedParty: "Jane Q Smith",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "NEW YORK",
      state: "NY",
      kind: "property record",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
  });

  it("maps a grantee (buyer) party role", () => {
    const party: AcrisParty = {
      document_id: "2023051500045001",
      party_type: "2",
      name: "RODRIGUEZ, MARIA E",
      city: "BRONX",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Maria E Rodriguez");

    expect(profile?.aliases).toContain("Party role: grantee (buyer)");
    expect(profile?.aliases).not.toContain("Party role: grantor (seller)");
  });

  it("maps a lender (party_type 3) role", () => {
    const party: AcrisParty = {
      document_id: "2024012000122003",
      party_type: "3",
      name: "CHEN, LINDA",
      city: "NEW YORK",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Linda Chen");

    expect(profile?.aliases).toContain("Party role: lender");
  });

  it("uses an unknown party_type code as a fallback alias", () => {
    const party: AcrisParty = {
      document_id: "2024012000122004",
      party_type: "9",
      name: "PUBLIC, SAM",
      city: "QUEENS",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Sam Public");

    expect(profile?.aliases).toContain("Party role code: 9");
  });

  it("omits any role alias when party_type is missing", () => {
    const party: AcrisParty = {
      document_id: "2024012000122005",
      name: "MILLER, FRANK",
      city: "STATEN ISLAND",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Frank Miller");

    expect(profile?.aliases).toEqual([]);
  });

  it("falls back to the recorded property address when the party has no mailing city/state", () => {
    const party: AcrisParty = {
      document_id: "2026040300428001",
      party_type: "2",
      name: "3111 LLC",
    };
    const legal: AcrisLegal = {
      document_id: "2026040300428001",
      borough: "4",
      block: "11653",
      lot: "50",
      street_number: "114-29",
      street_name: "126 STREET",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "3111 LLC", legal);

    expect(profile?.fullName).toBe("3111 LLC");
    expect(profile?.aliases).toContain("Party role: grantee (buyer)");
    expect(profile?.locations).toHaveLength(1);
    expect(profile?.locations?.[0]).toMatchObject({
      city: "New York",
      state: "NY",
      kind: "property record",
    });
  });

  it("defaults the state to NY when only the party city is present", () => {
    const party: AcrisParty = {
      document_id: "2024021200088007",
      party_type: "2",
      name: "KOWALSKI, ANNA",
      city: "ASTORIA",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Anna Kowalski");

    expect(profile?.locations?.[0]).toMatchObject({
      city: "ASTORIA",
      state: "NY",
    });
  });

  it("defaults the city to New York when only the party state is present", () => {
    const party: AcrisParty = {
      document_id: "2024021200088008",
      party_type: "2",
      name: "ROSSI, MARCO",
      state: "NJ",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Marco Rossi");

    expect(profile?.locations?.[0]).toMatchObject({
      city: "New York",
      state: "NJ",
    });
  });

  it("produces no locations when neither a party address nor a legals street exists", () => {
    const party: AcrisParty = {
      document_id: "2024021200088009",
      party_type: "2",
      name: "JONES, CHRIS",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Chris Jones");

    expect(profile).not.toBeNull();
    expect(profile?.locations).toEqual([]);
  });

  it("produces no locations when the legals record has no street components", () => {
    const party: AcrisParty = {
      document_id: "2024021200088010",
      party_type: "2",
      name: "JONES, CHRIS",
    };
    const legal: AcrisLegal = {
      document_id: "2024021200088010",
      borough: "1",
      block: "00100",
      lot: "0050",
      // street_number / street_name / unit all missing
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Chris Jones", legal);

    expect(profile?.locations).toEqual([]);
  });

  it("skips parties without any name", () => {
    expect(
      mapNycAcrisPartyToProfileInput(
        { party_type: "1", name: "" },
        "",
      ),
    ).toBeNull();
  });

  it("uses 'doc' as the document id fallback when document_id is missing", () => {
    const party: AcrisParty = {
      party_type: "2",
      name: "BROWN, LESLIE",
      city: "NEW YORK",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Leslie Brown");

    expect(profile?.sourceRecord?.sourceRecordId).toBe("doc__leslie_brown");
  });

  it("normalizes id and sourceRecordId keys consistently (apostrophes/punctuation)", () => {
    const party: AcrisParty = {
      document_id: "2024030100099001",
      party_type: "2",
      name: "O'NEAL, SHAUN",
      city: "BROOKLYN",
      state: "NY",
    };

    const profile = mapNycAcrisPartyToProfileInput(party, "Shaun O'Neal");

    // normalizeKey collapses any run of non-alphanumerics to a single "_",
    // so "O'Neal" -> "o_neal" (the apostrophe becomes one separator).
    expect(profile?.id).toBe("p_acris_shaun_o_neal");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "2024030100099001__shaun_o_neal",
    );
  });
});
