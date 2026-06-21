import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestFloridaSalaries,
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

describe("Florida salaries ingest", () => {
  const floridaCsvHeader =
    "Agency Name,Budget Entity,Position Number,Last Name,First Name,Middle Name,Employee Type,Full/Part Time,Class Code,Class Title,State Hire Date,Salary,OPS Hourly Rate";

  function csvResponse(body: string): Response {
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/csv" },
    });
  }

  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the CSV, maps records, and upserts profiles", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        csvResponse(
          [
            floridaCsvHeader,
            'FL Dept of Law Enforcement,FDLE - CAPITOL POLICE,002136,SMITH,JOHN,MAXWELL,Salaried,Full Time,8515,LAW ENFORCEMENT OFFICER,2015-07-06,$     6,7200.12,',
            'Department of Corrections,DOC - CENTRAL OFFICE,100455,SMITH,JOHN,,Salaried,Full Time,0109,CORRECTIONAL OFFICER,2019-03-04,$     4,0500.00,',
          ].join("\n"),
        ),
      );

    const result = await ingestFloridaSalaries({
      firstName: "JOHN",
      lastName: "SMITH",
      limit: 100,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("salaries.myflorida.com");
    expect(String(url)).toContain("by_name=JOHN+SMITH");
    expect(String(url)).toContain("format=csv");
    expect(init).toMatchObject({
      headers: expect.objectContaining({ accept: "text/csv" }),
      cache: "no-store",
    });

    // Source is always registered on ingest.
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "florida_state_employee_salaries" }),
    );

    // Two distinct employees (different agencies) -> two profiles.
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(2);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(2);

    const firstProfile = dbMocks.upsertProfile.mock.calls[0][0];
    expect(firstProfile).toMatchObject({
      id: "p_flsalary_john_maxwell_smith",
      fullName: "JOHN MAXWELL SMITH",
      ageRange: "Unknown",
      confidence: "Medium",
      sourceRecord: {
        sourceId: "florida_state_employee_salaries",
        sourceRecordId:
          "john_maxwell_smith__fl_dept_of_law_enforcement__002136",
      },
    });
    expect(firstProfile.aliases).toContain(
      "Last known institution: FL Dept of Law Enforcement",
    );
    expect(firstProfile.aliases).toContain(
      "Title: LAW ENFORCEMENT OFFICER",
    );
    expect(firstProfile.aliases).toContain("Year: 2015");
    expect(firstProfile.locations?.[0]).toMatchObject({
      city: "FL Dept of Law Enforcement",
      state: "FL",
      kind: "public payroll affiliation",
    });
  });

  it("dedupes multiple rows for the same employee + agency", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      csvResponse(
        [
          floridaCsvHeader,
          'FL Dept of Law Enforcement,FDLE - CAPITOL POLICE,002136,SMITH,JOHN,MAXWELL,Salaried,Full Time,8515,LAW ENFORCEMENT OFFICER,2015-07-06,$     6,7200.12,',
          // Same employee + agency, different position number -> deduped.
          'FL Dept of Law Enforcement,FDLE - CAPITOL POLICE,002137,SMITH,JOHN,MAXWELL,Salaried,Full Time,8515,LAW ENFORCEMENT OFFICER,2015-07-06,$     6,7200.12,',
        ].join("\n"),
      ),
    );

    const result = await ingestFloridaSalaries({
      firstName: "JOHN",
      lastName: "SMITH",
    });

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("skips records whose name does not match the required tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      csvResponse(
        [
          floridaCsvHeader,
          'Department of Corrections,DOC - CENTRAL OFFICE,100455,DOE,JANE,,Salaried,Full Time,0109,CORRECTIONAL OFFICER,2019-03-04,$     4,0500.00,',
          'FL Dept of Law Enforcement,FDLE - CAPITOL POLICE,002136,SMITH,JOHN,MAXWELL,Salaried,Full Time,8515,LAW ENFORCEMENT OFFICER,2015-07-06,$     6,7200.12,',
        ].join("\n"),
      ),
    );

    const result = await ingestFloridaSalaries({
      firstName: "JOHN",
      lastName: "SMITH",
    });

    // Both rows fetched, but only the matching one imported.
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile.mock.calls[0][0].fullName).toBe(
      "JOHN MAXWELL SMITH",
    );
  });

  it("returns zero when the search resolves to no first/last name", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await ingestFloridaSalaries({ query: "" });

    expect(result).toEqual({
      fetched: 0,
      imported: 0,
      url: "https://salaries.myflorida.com/",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("imports nothing when the CSV body is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(csvResponse(""));

    const result = await ingestFloridaSalaries({
      firstName: "JOHN",
      lastName: "SMITH",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    await expect(
      ingestFloridaSalaries({ firstName: "JOHN", lastName: "SMITH" }),
    ).rejects.toThrow(/Florida state employee salaries request failed: 404/);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });
});
