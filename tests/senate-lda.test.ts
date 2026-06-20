import { describe, expect, it } from "vitest";
import { mapSenateLdaLobbyistToProfileInput } from "@/lib/sources/senate-lda";

describe("Senate LDA source mapping", () => {
  it("maps a filing lobbyist to a context profile", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Mary Lynne Whalen",
      registrantName: "WILLIAMS AND JENSEN, PLLC",
      clientName: "FIDELITY INVESTMENTS",
      year: 1999,
      filing: {
        filing_uuid: "1cc64ccc-35a7-4972-b9e6-09db00289a7a",
        filing_year: 1999,
        client: { name: "FIDELITY INVESTMENTS", state: "MA", country: "US" },
        registrant: { name: "WILLIAMS AND JENSEN, PLLC", state: "DC" },
        lobbying_activities: [],
      },
    });

    expect(profile?.id).toBe("p_lda_mary_lynne_whalen");
    expect(profile?.fullName).toBe("Mary Lynne Whalen");
    expect(profile?.aliases).toContain(
      "Last known institution: WILLIAMS AND JENSEN, PLLC",
    );
    expect(profile?.aliases).toContain("Lobbying client: FIDELITY INVESTMENTS");
    expect(profile?.aliases).toContain("Year: 1999");
    expect(profile?.sourceRecord?.sourceId).toBe("senate_lda_lobbying");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "1cc64ccc-35a7-4972-b9e6-09db00289a7a__mary_lynne_whalen",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "WILLIAMS AND JENSEN, PLLC",
      state: "US",
      kind: "lobbying filing affiliation",
    });
  });

  it("returns null for an empty lobbyist name", () => {
    expect(
      mapSenateLdaLobbyistToProfileInput({
        fullName: "",
        filing: { filing_uuid: "x", filing_year: 2020 },
      }),
    ).toBeNull();
  });
});
