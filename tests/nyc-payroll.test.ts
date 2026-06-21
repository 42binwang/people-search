import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestNycPayroll,
  mapNycPayrollRecordToProfileInput,
} from "@/lib/sources/nyc-payroll";

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

describe("NYC payroll ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the Socrata dataset, maps, and upserts matching employees", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          fiscal_year: "2025",
          agency_name: "DEPARTMENT OF SANITATION",
          last_name: "SMITH",
          first_name: "JANE",
          mid_init: "A",
          title_description: "SANITATION WORKER",
          base_salary: "45000.00",
          pay_basis: "per Annum",
          work_location_borough: "MANHATTAN",
          leave_status_as_of_june_30: "ACTIVE",
        },
        {
          fiscal_year: "2024",
          agency_name: "DEPARTMENT OF EDUCATION",
          last_name: "SMITH",
          first_name: "JANE",
          mid_init: "A",
          title_description: "TEACHER",
        },
      ],
    } as any);

    const result = await ingestNycPayroll({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      "https://data.cityofnewyork.us/resource/k397-673e.json",
    );
    const search = new URL(url).searchParams;
    expect(search.get("$where")).toBe(
      "upper(last_name)='SMITH' AND upper(first_name)='JANE'",
    );
    expect(search.get("$order")).toBe("fiscal_year DESC");
    expect(search.get("$limit")).toBe("100");
    expect((init as RequestInit).cache).toBe("no-store");

    expect(result.fetched).toBe(2);
    // Both rows map to the same employee key (same name + agency?), but here
    // the agencies differ so two distinct profiles are produced.
    expect(result.imported).toBe(2);
    // The returned url is the fully-built Socrata request URL.
    expect(result.url).toBe(fetchMock.mock.calls[0][0]);

    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "nyc_citywide_payroll" }),
    );
    expect(upsertProfile).toHaveBeenCalledTimes(2);

    const firstCall = upsertProfile.mock.calls[0][0];
    expect(firstCall.id).toBe("p_nycpayroll_jane_a_smith");
    expect(firstCall.fullName).toBe("JANE A SMITH");
    expect(firstCall.ageRange).toBe("Unknown");
    expect(firstCall.confidence).toBe("Medium");
    expect(firstCall.aliases).toContain(
      "Last known institution: DEPARTMENT OF SANITATION",
    );
    expect(firstCall.aliases).toContain("Title: SANITATION WORKER");
    expect(firstCall.aliases).toContain("Year: 2025");
    expect(firstCall.locations?.[0]).toMatchObject({
      city: "DEPARTMENT OF SANITATION",
      state: "NY",
      kind: "public payroll affiliation",
      sourceId: "nyc_citywide_payroll",
    });
    expect(firstCall.sourceRecord?.sourceId).toBe("nyc_citywide_payroll");
    expect(firstCall.sourceRecord?.raw).toMatchObject({
      matchedEmployee: "JANE A SMITH",
    });

    fetchMock.mockRestore();
  });

  it("skips rows whose normalized name does not contain every required token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          fiscal_year: "2025",
          agency_name: "POLICE DEPARTMENT",
          last_name: "SMITH",
          first_name: "JANE",
          title_description: "POLICE OFFICER",
        },
        // Same last name, different first name — must be filtered out.
        {
          fiscal_year: "2025",
          agency_name: "FIRE DEPARTMENT",
          last_name: "SMITH",
          first_name: "ROBERT",
          title_description: "FIREFIGHTER",
        },
        // Completely unrelated name.
        {
          fiscal_year: "2025",
          agency_name: "DOITT",
          last_name: "GARCIA",
          first_name: "MARIA",
          title_description: "ANALYST",
        },
      ],
    } as any);

    const result = await ingestNycPayroll({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result.fetched).toBe(3);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(upsertProfile.mock.calls[0][0].fullName).toBe("JANE SMITH");

    fetchMock.mockRestore();
  });

  it("dedupes multiple records for the same employee+agency into one profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          fiscal_year: "2025",
          agency_name: "DEPARTMENT OF EDUCATION",
          last_name: "SMITH",
          first_name: "JANE",
          title_description: "TEACHER",
        },
        // Same name + agency, different fiscal year -> same employee key.
        {
          fiscal_year: "2024",
          agency_name: "DEPARTMENT OF EDUCATION",
          last_name: "SMITH",
          first_name: "JANE",
          title_description: "TEACHER",
        },
      ],
    } as any);

    const result = await ingestNycPayroll({ firstName: "Jane", lastName: "Smith" });

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);

    fetchMock.mockRestore();
  });

  it("respects the limit option (caps fetch slice and upserts)", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      fiscal_year: "2025",
      agency_name: `AGENCY ${i}`,
      last_name: "SMITH",
      first_name: "JANE",
      title_description: "WORKER",
    }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => rows,
    } as any);

    const result = await ingestNycPayroll({
      firstName: "Jane",
      lastName: "Smith",
      limit: 2,
    });

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("$limit")).toBe(
      "2",
    );
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(2);
    expect(upsertProfile).toHaveBeenCalledTimes(2);

    fetchMock.mockRestore();
  });

  it("returns early with zero results when no name is provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await ingestNycPayroll({});

    expect(result).toEqual({
      fetched: 0,
      imported: 0,
      url: "https://data.cityofnewyork.us/resource/k397-673e.json",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("falls back to splitting the free-form query into first/last", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => [
        {
          fiscal_year: "2025",
          agency_name: "DEPARTMENT OF EDUCATION",
          last_name: "SMITH",
          first_name: "JANE",
        },
      ],
    } as any);

    const result = await ingestNycPayroll({ query: "Jane Smith" });

    expect(result.imported).toBe(1);
    const where = new URL(fetchMock.mock.calls[0][0]).searchParams.get("$where");
    expect(where).toBe("upper(last_name)='SMITH' AND upper(first_name)='JANE'");

    fetchMock.mockRestore();
  });

  it("throws when the Socrata endpoint returns a non-ok status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as any);

    await expect(
      ingestNycPayroll({ firstName: "Jane", lastName: "Smith" }),
    ).rejects.toThrow("NYC Citywide Payroll request failed: 500");

    expect(upsertProfile).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });
});
