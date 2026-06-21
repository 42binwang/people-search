import { describe, expect, it } from "vitest";
import {
  mapSenateLdaLobbyistToProfileInput,
  type LdaFiling,
} from "@/lib/sources/senate-lda";

const baseFiling: LdaFiling = {
  filing_uuid: "1cc64ccc-35a7-4972-b9e6-09db00289a7a",
  filing_year: 1999,
  client: { name: "FIDELITY INVESTMENTS", state: "MA", country: "US" },
  registrant: { name: "WILLIAMS AND JENSEN, PLLC", state: "DC" },
  lobbying_activities: [],
};

describe("Senate LDA source mapping", () => {
  it("maps a filing lobbyist to a context profile", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Mary Lynne Whalen",
      registrantName: "WILLIAMS AND JENSEN, PLLC",
      clientName: "FIDELITY INVESTMENTS",
      year: 1999,
      filing: baseFiling,
    });

    expect(profile?.id).toBe("p_lda_mary_lynne_whalen");
    expect(profile?.fullName).toBe("Mary Lynne Whalen");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain(
      "Last known institution: WILLIAMS AND JENSEN, PLLC",
    );
    expect(profile?.aliases).toContain("Lobbying client: FIDELITY INVESTMENTS");
    expect(profile?.aliases).toContain("Year: 1999");
    expect(profile?.sourceRecord?.sourceId).toBe("senate_lda_lobbying");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "1cc64ccc-35a7-4972-b9e6-09db00289a7a__mary_lynne_whalen",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedLobbyist: "Mary Lynne Whalen",
      filing: baseFiling,
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "WILLIAMS AND JENSEN, PLLC",
      state: "US",
      kind: "lobbying filing affiliation",
    });
  });

  it("omits locations and all aliases when registrant/client/year are missing", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Marcus Reid",
      filing: { filing_uuid: "no-affil", filing_year: 2022 },
    });

    expect(profile).not.toBeNull();
    expect(profile?.aliases).toEqual([]);
    expect(profile?.locations).toEqual([]);
    expect(profile?.id).toBe("p_lda_marcus_reid");
  });

  it("includes only the matching aliases when client/year present but no registrant", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Jane Doe",
      clientName: "Lockheed Martin",
      year: 2021,
      filing: { filing_uuid: "partial" },
    });

    expect(profile?.aliases).toEqual([
      "Lobbying client: Lockheed Martin",
      "Year: 2021",
    ]);
    // No registrant means no affiliation location.
    expect(profile?.locations).toEqual([]);
  });

  it("normalizes a name with punctuation and surrounding whitespace into a stable id", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: " O'Brien,  Mary-Jane !! ",
      registrantName: "Brownstein Hyatt",
      filing: { filing_uuid: "punct" },
    });

    expect(profile?.id).toBe("p_lda_o_brien_mary_jane");
    // fullName is preserved verbatim.
    expect(profile?.fullName).toBe(" O'Brien,  Mary-Jane !! ");
  });

  it("falls back to 'filing' in sourceRecordId when filing_uuid is absent", () => {
    const profile = mapSenateLdaLobbyistToProfileInput({
      fullName: "Jane Doe",
      filing: {},
    });

    expect(profile?.sourceRecord?.sourceRecordId).toBe("filing__jane_doe");
  });

  it("returns null for an empty lobbyist name even when other fields are present", () => {
    expect(
      mapSenateLdaLobbyistToProfileInput({
        fullName: "",
        registrantName: "WILLIAMS AND JENSEN, PLLC",
        clientName: "FIDELITY INVESTMENTS",
        year: 1999,
        filing: baseFiling,
      }),
    ).toBeNull();
  });
});
