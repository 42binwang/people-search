import { describe, expect, it } from "vitest";
import {
  mapSecEdgarInsiderToProfileInput,
  type SecEdgarInsiderProfileFiling,
} from "@/lib/sources/sec-edgar-insiders";

const baseFiling: SecEdgarInsiderProfileFiling = {
  form: "4",
  adsh: "0001234567-24-000001",
  fileDate: "2024-03-15",
  issuerName: "Acme Corporation",
  issuerCik: "0001234567",
  insiderCik: "0007654321",
  state: "CA",
  location: "San Francisco, CA",
  role: "Chief Financial Officer",
};

describe("SEC EDGAR insiders source mapping", () => {
  it("maps a Form 4 reporting owner to a context profile", () => {
    const profile = mapSecEdgarInsiderToProfileInput(baseFiling, "Jane A Smith");

    expect(profile?.fullName).toBe("Jane A Smith");
    expect(profile?.id).toBe("p_secedgar_jane_a_smith_acme_corporation");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain(
      "Last known institution: Acme Corporation",
    );
    expect(profile?.aliases).toContain("Role: Chief Financial Officer");
    expect(profile?.aliases).toContain("Year: 2024");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Acme Corporation",
      state: "CA",
      kind: "corporate filing affiliation",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "sec_edgar_insiders",
      sourceRecordId: "0001234567-24-000001__jane_a_smith",
      raw: { filing: baseFiling, matchedInsider: "Jane A Smith" },
    });
  });

  it("falls back to the generic insider role when role is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, role: undefined },
      "Jane A Smith",
    );

    expect(profile?.aliases).toContain(
      "Role: Securities filing insider (Form 3/4/5 reporting owner)",
    );
  });

  it("falls back to the generic insider role when role is blank", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, role: "   " },
      "Jane A Smith",
    );

    expect(profile?.aliases).toContain(
      "Role: Securities filing insider (Form 3/4/5 reporting owner)",
    );
  });

  it("uses US as the fallback state when no issuer state is provided", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, state: undefined },
      "Jane A Smith",
    );

    expect(profile?.locations?.[0]).toMatchObject({
      city: "Acme Corporation",
      state: "US",
    });
  });

  it("drops the location entry when the issuer name is missing", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, issuerName: "" },
      "Jane A Smith",
    );

    expect(profile?.locations).toEqual([]);
    expect(profile?.aliases).not.toContain(
      "Last known institution: Acme Corporation",
    );
  });

  it("builds the record id from the raw issuer when adsh is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, adsh: undefined },
      "Jane A Smith",
    );

    // The no-adsh branch joins the RAW issuer name to the normalized full name.
    expect(profile?.sourceRecord.sourceRecordId).toBe(
      "Acme Corporation__jane_a_smith",
    );
  });

  it("uses an 'issuer' placeholder when adsh is absent and issuer is undefined", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, adsh: undefined, issuerName: undefined },
      "Jane A Smith",
    );

    expect(profile?.sourceRecord.sourceRecordId).toBe("issuer__jane_a_smith");
    expect(profile?.id).toBe("p_secedgar_jane_a_smith_issuer");
  });

  it("produces an empty issuer prefix in the record id when issuer is an empty string", () => {
    // `?? "issuer"` only fires for null/undefined, so an empty-string issuer
    // yields a leading-underscore record id; the `id` still normalizes to
    // `..._issuer` because normalizeKey("") falls back to "unknown" -> dropped.
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, adsh: undefined, issuerName: "" },
      "Jane A Smith",
    );

    expect(profile?.sourceRecord.sourceRecordId).toBe("__jane_a_smith");
  });

  it("omits the Year alias when file_date has no 4-digit year", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, fileDate: "undated" },
      "Jane A Smith",
    );

    expect(profile?.aliases.some((a) => a.startsWith("Year:"))).toBe(false);
  });

  it("omits the Year alias when file_date is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, fileDate: undefined },
      "Jane A Smith",
    );

    expect(profile?.aliases.some((a) => a.startsWith("Year:"))).toBe(false);
  });

  it("normalizes special characters in the profile id and record id", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, issuerName: "T. Rowe Price Group, Inc." },
      "Mary-Beth O'Neil",
    );

    expect(profile?.id).toBe(
      "p_secedgar_mary_beth_o_neil_t_rowe_price_group_inc",
    );
    expect(profile?.sourceRecord.sourceRecordId).toBe(
      "0001234567-24-000001__mary_beth_o_neil",
    );
  });

  it("returns null when the insider full name is empty", () => {
    expect(mapSecEdgarInsiderToProfileInput(baseFiling, "")).toBeNull();
  });

  it("treats a whitespace-only name as non-empty (guard is truthy, not trimmed)", () => {
    // The `if (!fullName)` guard only rejects falsy values, so a whitespace
    // string passes through and is normalized to "unknown" downstream.
    const profile = mapSecEdgarInsiderToProfileInput(baseFiling, "   ");

    expect(profile).not.toBeNull();
    expect(profile?.fullName).toBe("   ");
    expect(profile?.sourceRecord.sourceRecordId).toBe(
      "0001234567-24-000001__unknown",
    );
    expect(profile?.id).toBe("p_secedgar_acme_corporation");
  });
});
