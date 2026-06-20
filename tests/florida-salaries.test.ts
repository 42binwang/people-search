import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  mapFloridaSalaryRecordToProfileInput,
  registerFloridaSalariesSource,
} from "@/lib/sources/florida-salaries";

describe("Florida state salaries source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
  });

  it("maps a payroll record to a context profile", () => {
    const profile = mapFloridaSalaryRecordToProfileInput(
      {
        agencyName: "FL Dept of Law Enforcement",
        budgetEntity: "FDLE - CAPITOL POLICE",
        positionNumber: "002136",
        lastName: "SMITH",
        firstName: "JOHN",
        middleName: "MAXWELL",
        employeeType: "Salaried",
        fullOrPartTime: "Full Time",
        classCode: "8515",
        classTitle: "LAW ENFORCEMENT OFFICER",
        stateHireDate: "2015-07-06",
        salary: "$     6,7200.12",
      },
      "JOHN MAXWELL SMITH",
    );

    expect(profile?.id).toBe("p_flsalary_john_maxwell_smith");
    expect(profile?.fullName).toBe("JOHN MAXWELL SMITH");
    expect(profile?.aliases).toContain(
      "Last known institution: FL Dept of Law Enforcement",
    );
    expect(profile?.aliases).toContain("Title: LAW ENFORCEMENT OFFICER");
    expect(profile?.aliases).toContain("Year: 2015");
    expect(profile?.sourceRecord?.sourceId).toBe(
      "florida_state_employee_salaries",
    );
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "john_maxwell_smith__fl_dept_of_law_enforcement__002136",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({ matchedEmployee: "JOHN MAXWELL SMITH" });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "FL Dept of Law Enforcement",
      state: "FL",
      kind: "public payroll affiliation",
    });
    expect(profile?.contacts).toEqual([]);
  });

  it("registers the source with public-payroll metadata", () => {
    registerFloridaSalariesSource();

    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "florida_state_employee_salaries",
        category: "Public payroll record",
        jurisdiction: "Florida",
        acquisitionMethod: "official_api",
      }),
    );
  });

  it("skips records without a name", () => {
    expect(
      mapFloridaSalaryRecordToProfileInput(
        { agencyName: "Department of Corrections", classTitle: "CLERK" },
        "",
      ),
    ).toBeNull();
  });
});
