import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestUcAnnualWage,
  mapUcWageRecordToProfileInput,
  registerUcAnnualWageSource,
} from "@/lib/sources/uc-annual-wage";

const searchMocks = vi.hoisted(() => ({
  response: { rows: [] as unknown[] },
}));

// Stub global fetch to the UC /wage/search endpoint so ingest is deterministic.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => searchMocks.response,
  })) as unknown as typeof fetch,
);

describe("UC annual wage source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    (fetch as unknown as { mockClear: () => void }).mockClear();
    searchMocks.response = { rows: [] };
  });

  it("maps a UC payroll record to a context profile", () => {
    const profile = mapUcWageRecordToProfileInput(
      {
        id: 1,
        year: "2024",
        location: "Berkeley",
        firstname: "JANET",
        lastname: "NAPOLITANO",
        title: "PROF-AY",
        grosspay: "330,692.00",
        basepay: "330,692.00",
        overtimepay: "0.00",
        adjustpay: "0.00",
      },
      "JANET NAPOLITANO",
    );

    expect(profile?.id).toBe("p_ucwage_janet_napolitano");
    expect(profile?.fullName).toBe("JANET NAPOLITANO");
    expect(profile?.aliases).toContain("Last known institution: UC Berkeley");
    expect(profile?.aliases).toContain("Title: PROF-AY");
    expect(profile?.aliases).toContain("Year: 2024");
    expect(profile?.sourceRecord?.sourceId).toBe("uc_annual_wage");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "janet_napolitano__berkeley__2024",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedEmployee: "JANET NAPOLITANO",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "UC Berkeley",
      state: "CA",
      kind: "public payroll affiliation",
    });
    expect(profile?.contacts).toEqual([]);
  });

  it("registers the source with public-payroll metadata", () => {
    registerUcAnnualWageSource();

    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "uc_annual_wage",
        category: "Public payroll record",
        jurisdiction: "California (University of California)",
        acquisitionMethod: "official_api",
      }),
    );
  });

  it("dedupes employees by normalized name + campus and filters to required tokens", async () => {
    searchMocks.response = {
      rows: [
        // Two records for the same employee (same name + campus) -> deduped.
        {
          id: 1,
          year: "2024",
          location: "Berkeley",
          firstname: "MARIA",
          lastname: "GARCIA",
          title: "PROF-AY",
        },
        {
          id: 2,
          year: "2024",
          location: "Berkeley",
          firstname: "MARIA",
          lastname: "GARCIA",
          title: "PROF-AY",
        },
        // Same name, different campus -> kept as a second profile.
        {
          id: 3,
          year: "2024",
          location: "Davis",
          firstname: "MARIA",
          lastname: "GARCIA",
          title: "PROF-AY",
        },
        // Missing a required query token -> filtered out.
        {
          id: 4,
          year: "2024",
          location: "Berkeley",
          firstname: "ANA",
          lastname: "GARCIA",
          title: "SRA 2",
        },
      ],
    };

    const result = await ingestUcAnnualWage({
      firstName: "Maria",
      lastName: "Garcia",
    });

    expect(result.imported).toBe(2);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(2);
  });

  it("skips import when no name query is provided", async () => {
    const result = await ingestUcAnnualWage({});

    expect(result.imported).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });
});
