import { describe, expect, it } from "vitest";
import { mapBuffaloPermitRowToProfileInput } from "@/lib/sources/buffalo-permits";

describe("Buffalo building permits mapping", () => {
  it("maps an individual applicant (surname-first) to a person profile", () => {
    const profile = mapBuffaloPermitRowToProfileInput({
      apno: "REP21-9533033",
      applicant: "SMITH CLARA L",
      lictype: "HOMEOWNER",
      stname: "190 ORLANDO",
      city: "BUFFALO",
      state: "NY",
      zip: "14210",
      issued: "2021-05-03T00:00:00.000",
      descofwork: "Replace shingle roof.",
    });

    expect(profile?.fullName).toBe("Clara L Smith");
    expect(profile?.id).toBe("p_buffalo_permits_rep21_9533033");
    expect(profile?.confidence).toBe("Low");
    expect(profile?.aliases).toContain("Buffalo permit #: REP21-9533033");
    expect(profile?.aliases).toContain("Permit type: HOMEOWNER");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "190 ORLANDO",
      city: "Buffalo",
      state: "NY",
      zip: "14210",
      kind: "building permit applicant (permit/work site; not confirmed residence)",
    });
  });

  it("filters to the queried first name", () => {
    const row = {
      apno: "X1",
      applicant: "SMITH CLARA L",
      stname: "1 A",
      city: "BUFFALO",
      state: "NY",
    };
    expect(mapBuffaloPermitRowToProfileInput(row, "Clara")).not.toBeNull();
    expect(mapBuffaloPermitRowToProfileInput(row, "Marcus")).toBeNull();
  });

  it("skips contractor and business applicants", () => {
    expect(
      mapBuffaloPermitRowToProfileInput({
        apno: "X2",
        applicant: "ACME PLUMBING LLC",
        stname: "2 B",
        city: "BUFFALO",
        state: "NY",
      }),
    ).toBeNull();
    expect(
      mapBuffaloPermitRowToProfileInput({
        apno: "X3",
        applicant: "JOHNSON HEATING",
        stname: "3 C",
        city: "BUFFALO",
        state: "NY",
      }),
    ).toBeNull();
  });

  it("skips applicants without enough name tokens", () => {
    expect(
      mapBuffaloPermitRowToProfileInput({
        apno: "X4",
        applicant: "SMITH",
        stname: "4 D",
        city: "BUFFALO",
        state: "NY",
      }),
    ).toBeNull();
  });
});
