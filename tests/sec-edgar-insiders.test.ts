import { describe, expect, it } from "vitest";
import { mapSecEdgarInsiderToProfileInput } from "@/lib/sources/sec-edgar-insiders";

describe("SEC EDGAR insiders source mapping", () => {
  it("maps a Form 4 reporting owner to a context profile", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      {
        form: "4",
        adsh: "0001628280-26-044069",
        fileDate: "2026-06-17",
        issuerName: "SPACE EXPLORATION TECHNOLOGIES CORP",
        issuerCik: "0001181412",
        insiderCik: "0001494730",
        state: "TX",
        location: "Starbase, TX",
        role: "Officer (CEO, CTO & Chairman), Director, 10% Owner",
      },
      "Elon Musk",
    );

    expect(profile?.id).toBe(
      "p_secedgar_elon_musk_space_exploration_technologies_corp",
    );
    expect(profile?.fullName).toBe("Elon Musk");
    expect(profile?.aliases).toContain(
      "Last known institution: SPACE EXPLORATION TECHNOLOGIES CORP",
    );
    expect(profile?.aliases).toContain(
      "Role: Officer (CEO, CTO & Chairman), Director, 10% Owner",
    );
    expect(profile?.aliases).toContain("Year: 2026");
    expect(profile?.sourceRecord?.sourceId).toBe("sec_edgar_insiders");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "0001628280-26-044069__elon_musk",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "SPACE EXPLORATION TECHNOLOGIES CORP",
      state: "TX",
      kind: "corporate filing affiliation",
    });
  });

  it("falls back to a generic insider role when role is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      {
        form: "4",
        adsh: "0001209191-24-000001",
        fileDate: "2024-01-02",
        issuerName: "EXAMPLE HOLDINGS INC",
      },
      "Jane Smith",
    );

    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.aliases).toContain(
      "Role: Securities filing insider (Form 3/4/5 reporting owner)",
    );
    expect(profile?.id).toBe("p_secedgar_jane_smith_example_holdings_inc");
  });

  it("skips insiders without any name (skip-on-empty)", () => {
    expect(
      mapSecEdgarInsiderToProfileInput(
        { issuerName: "EXAMPLE HOLDINGS INC" },
        "",
      ),
    ).toBeNull();
  });
});
