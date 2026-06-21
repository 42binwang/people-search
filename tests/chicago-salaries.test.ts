import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestChicagoSalaries,
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

describe("Chicago salaries ingest", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.spyOn(globalThis, "fetch").mockRestore();
  });

  it("fetches the Socrata dataset, imports matching employees, and upserts mapped profiles", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            name: "AARON, JEFFERY M",
            job_titles: "LIEUTENANT",
            department: "CHICAGO POLICE DEPARTMENT",
            full_or_part_time: "F",
            salary_or_hourly: "SALARY",
            annual_salary: "165624",
          },
          {
            name: "AARON, JEFFERY M",
            job_titles: "SERGEANT",
            department: "CHICAGO FIRE DEPARTMENT",
            full_or_part_time: "F",
            salary_or_hourly: "SALARY",
            annual_salary: "110000",
          },
        ],
      } as unknown as Response);

    const result = await ingestChicagoSalaries({
      firstName: "JEFFERY",
      lastName: "AARON",
    });

    // The ingest must hit the documented Socrata SODA endpoint for xzkq-xp2w.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl).toContain(
      "data.cityofchicago.org/resource/xzkq-xp2w.json",
    );
    // SoQL params are URL-encoded by URLSearchParams ($where -> %24where).
    expect(requestedUrl).toContain("%24where=");
    expect(requestedUrl).toContain("%24limit=");
    expect(requestedUrl).toContain("upper%28name%29");

    // Both distinct (name, department) employees are imported.
    expect(result.imported).toBe(2);
    expect(result.imported).toBeGreaterThan(0);
    expect(result.fetched).toBe(2);
    expect(result.url).toContain(
      "data.cityofchicago.org/resource/xzkq-xp2w.json",
    );

    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(2);

    // The first upserted profile is mapped correctly: name reordered to
    // "First Last" and the department/job title preserved as affiliation.
    const firstProfile = dbMocks.upsertProfile.mock.calls[0][0];
    expect(firstProfile.fullName).toBe("JEFFERY M AARON");
    expect(firstProfile.id).toBe(
      "p_chicagosalary_jeffery_m_aaron__chicago_police_department",
    );
    expect(firstProfile.confidence).toBe("Medium");
    expect(firstProfile.ageRange).toBe("Unknown");
    expect(firstProfile.aliases).toEqual([
      "CHICAGO POLICE DEPARTMENT",
      "LIEUTENANT",
    ]);
    expect(firstProfile.locations).toEqual([
      {
        city: "CHICAGO POLICE DEPARTMENT",
        state: "IL",
        kind: "public payroll affiliation",
        sourceId: "chicago_current_employee_salaries",
      },
    ]);
    expect(firstProfile.contacts).toEqual([]);
    expect(firstProfile.sourceRecord?.sourceId).toBe(
      "chicago_current_employee_salaries",
    );

    // Source registration happens on every ingest.
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "chicago_current_employee_salaries",
        acquisitionMethod: "official_api",
      }),
    );
  });

  it("skips rows whose name does not match the requested tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          name: "AARON, JEFFERY M",
          job_titles: "LIEUTENANT",
          department: "CHICAGO POLICE DEPARTMENT",
          salary_or_hourly: "SALARY",
          annual_salary: "165624",
        },
        {
          // Different employee — should be filtered out by the name guard.
          name: "ABBOTT, MARY",
          job_titles: "CLERK",
          department: "WATER MGMNT",
          salary_or_hourly: "SALARY",
          annual_salary: "70000",
        },
      ],
    } as unknown as Response);

    const result = await ingestChicagoSalaries({
      firstName: "JEFFERY",
      lastName: "AARON",
    });

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile.mock.calls[0][0].fullName).toBe(
      "JEFFERY M AARON",
    );
  });

  it("throws when the Socrata response is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => [],
    } as unknown as Response);

    await expect(
      ingestChicagoSalaries({ firstName: "JEFFERY", lastName: "AARON" }),
    ).rejects.toThrow(/Chicago employee salaries request failed: 500/);

    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("returns early without fetching when no name is provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await ingestChicagoSalaries({});

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });
});
