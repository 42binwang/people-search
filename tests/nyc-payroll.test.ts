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
    expect(profile?.aliases).toContain(
      "Last known institution: ADMIN FOR CHILDREN'S SVCS",
    );
    expect(profile?.aliases).toContain("Title: PROGRAM EVALUATOR");
    expect(profile?.aliases).toContain("Year: 2025");
    expect(profile?.sourceRecord?.sourceId).toBe("nyc_citywide_payroll");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "elmer_s_blanco__admin_for_children_s_svcs__2025",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "ADMIN FOR CHILDREN'S SVCS",
      state: "NY",
      kind: "public payroll affiliation",
    });
  });

  it("builds a full name from first/mid/last when mid initial is present", () => {
    const profile = mapNycPayrollRecordToProfileInput(
      {
        fiscal_year: "2024",
        agency_name: "POLICE DEPARTMENT",
        last_name: "SMITH",
        first_name: "JANE",
        mid_init: "Q",
        title_description: "POLICE OFFICER",
      },
      "JANE Q SMITH",
    );

    expect(profile?.fullName).toBe("JANE Q SMITH");
    expect(profile?.aliases).toContain("Year: 2024");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "POLICE DEPARTMENT",
      state: "NY",
    });
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
});
