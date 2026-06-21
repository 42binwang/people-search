import { describe, expect, it } from "vitest";
import { mapNycPayrollRecordToProfileInput } from "@/lib/sources/nyc-payroll";

describe("NYC Citywide Payroll source mapping", () => {
  it("maps a payroll record to a context profile", () => {
    const profile = mapNycPayrollRecordToProfileInput(
      {
        fiscal_year: "2025",
        agency_name: "ADMIN FOR CHILDREN'S SVCS",
        last_name: "BLANCO",
        first_name: "ELMER",
        mid_init: "S",
        title_description: "PROGRAM EVALUATOR",
        base_salary: "95897.00",
        pay_basis: "per Annum",
        work_location_borough: "MANHATTAN",
        leave_status_as_of_june_30: "ACTIVE",
      },
      "ELMER S BLANCO",
    );

    expect(profile?.id).toBe("p_nycpayroll_elmer_s_blanco");
    expect(profile?.fullName).toBe("ELMER S BLANCO");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain(
      "Last known institution: ADMIN FOR CHILDREN'S SVCS",
    );
    expect(profile?.aliases).toContain("Title: PROGRAM EVALUATOR");
    expect(profile?.aliases).toContain("Year: 2025");
    expect(profile?.sourceRecord?.sourceId).toBe("nyc_citywide_payroll");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "elmer_s_blanco__admin_for_children_s_svcs__2025",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedEmployee: "ELMER S BLANCO",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "ADMIN FOR CHILDREN'S SVCS",
      state: "NY",
      kind: "public payroll affiliation",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
  });

  it("maps a record with only a name and no agency/title/year", () => {
    const profile = mapNycPayrollRecordToProfileInput(
      { last_name: "CHEN", first_name: "WEI" },
      "WEI CHEN",
    );

    expect(profile?.id).toBe("p_nycpayroll_wei_chen");
    expect(profile?.fullName).toBe("WEI CHEN");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toEqual([]);
    expect(profile?.locations).toEqual([]);
    expect(profile?.sourceRecord?.sourceRecordId).toBe("wei_chen__unknown__fy");
  });

  it("omits only the missing alias entries when some fields are absent", () => {
    const profile = mapNycPayrollRecordToProfileInput(
      { agency_name: "POLICE DEPARTMENT", fiscal_year: "2024" },
      "JANE Q SMITH",
    );

    expect(profile?.fullName).toBe("JANE Q SMITH");
    expect(profile?.aliases).toEqual([
      "Last known institution: POLICE DEPARTMENT",
      "Year: 2024",
    ]);
    expect(profile?.locations?.[0]?.city).toBe("POLICE DEPARTMENT");
  });

  it("skips records without any name", () => {
    expect(
      mapNycPayrollRecordToProfileInput(
        {
          fiscal_year: "2025",
          agency_name: "DEPARTMENT OF EDUCATION",
          last_name: "",
          first_name: "",
          title_description: "TEACHER",
        },
        "",
      ),
    ).toBeNull();
  });

  it("treats a non-empty (whitespace-only) name as present — null only for empty string", () => {
    // The adapter guards with `if (!fullName)`, so an empty string is skipped
    // but a whitespace-only string is not — pin that contract here.
    expect(
      mapNycPayrollRecordToProfileInput(
        {
          agency_name: "DEPARTMENT OF SANITATION",
          title_description: "SANITATION WORKER",
          fiscal_year: "2023",
        },
        "",
      ),
    ).toBeNull();

    const profile = mapNycPayrollRecordToProfileInput(
      { agency_name: "DEPARTMENT OF SANITATION" },
      "   ",
    );
    expect(profile).not.toBeNull();
    expect(profile?.fullName).toBe("   ");
  });

  it("normalizes non-alphanumeric name characters into the id", () => {
    const profile = mapNycPayrollRecordToProfileInput(
      { agency_name: "FIRE DEPARTMENT" },
      "O'Brien McCarthy Jr.",
    );

    expect(profile?.id).toBe("p_nycpayroll_o_brien_mccarthy_jr");
  });
});
