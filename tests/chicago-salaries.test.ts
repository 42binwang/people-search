import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  mapChicagoSalaryRecordToProfileInput,
  registerChicagoSalariesSource,
} from "@/lib/sources/chicago-salaries";

describe("Chicago salaries source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
  });

  it("maps a payroll record to a context profile", () => {
    const profile = mapChicagoSalaryRecordToProfileInput(
      {
        name: "AARON, JEFFERY M",
        job_titles: "LIEUTENANT",
        department: "CHICAGO POLICE DEPARTMENT",
        full_or_part_time: "F",
        salary_or_hourly: "SALARY",
        annual_salary: "165624",
      },
      "JEFFERY M AARON",
    );

    expect(profile?.id).toBe(
      "p_chicagosalary_jeffery_m_aaron__chicago_police_department",
    );
    expect(profile?.fullName).toBe("JEFFERY M AARON");
    expect(profile?.aliases).toContain("CHICAGO POLICE DEPARTMENT");
    expect(profile?.aliases).toContain("LIEUTENANT");
    expect(profile?.sourceRecord?.sourceId).toBe(
      "chicago_current_employee_salaries",
    );
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "AARON, JEFFERY M__jeffery_m_aaron__chicago_police_department",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "CHICAGO POLICE DEPARTMENT",
      state: "IL",
      kind: "public payroll affiliation",
    });
    expect(profile?.contacts).toEqual([]);
  });

  it("registers the source with public-payroll metadata", () => {
    registerChicagoSalariesSource();

    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "chicago_current_employee_salaries",
        category: "Public payroll record",
        jurisdiction: "Chicago, IL",
        acquisitionMethod: "official_api",
      }),
    );
  });

  it("skips records without a name", () => {
    expect(
      mapChicagoSalaryRecordToProfileInput(
        { department: "WATER MGMNT", job_titles: "CLERK" },
        "",
      ),
    ).toBeNull();
  });
});
