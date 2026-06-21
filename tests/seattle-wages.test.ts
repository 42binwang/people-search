import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertProfile } from "@/lib/db";
import {
  ingestSeattleWages,
  mapSeattleWageRecordToProfileInput,
} from "@/lib/sources/seattle-wages";

describe("Seattle wage source mapping", () => {
  it("maps an employee record to a payroll context profile", () => {
    const profile = mapSeattleWageRecordToProfileInput(
      {
        first_name: "Lori",
        last_name: "Aagard",
        department: "Seattle Police Department",
        job_title: "Executive 4",
        hourly_rate: "150.43",
      },
      "Lori Aagard",
    );

    expect(profile?.id).toBe(
      "p_seattlewage_lori_aagard__seattle_police_department",
    );
    expect(profile?.fullName).toBe("Lori Aagard");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain("Seattle Police Department");
    expect(profile?.aliases).toContain("Executive 4");
    expect(profile?.aliases).toContain("Hourly wage: $150.43");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Seattle Police Department",
      state: "WA",
      kind: "public payroll affiliation",
    });
  });

  it("omits the wage alias when hourly_rate is missing but still maps the profile", () => {
    const profile = mapSeattleWageRecordToProfileInput(
      { first_name: "Jordan", last_name: "Lee", department: "Parks" },
      "Jordan Lee",
    );
    expect(profile?.fullName).toBe("Jordan Lee");
    expect(profile?.aliases.some((a) => a.startsWith("Hourly wage:"))).toBe(
      false,
    );
  });

  it("skips records without a name", () => {
    expect(
      mapSeattleWageRecordToProfileInput({ department: "X" }, ""),
    ).toBeNull();
  });
});

describe("Seattle wages ingest", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(upsertProfile).mockReset();
  });

  it("fetches by surname, name-filters, and upserts matching employees", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          first_name: "Jane",
          last_name: "Smith",
          department: "Parks and Recreation",
          job_title: "Gardener",
          hourly_rate: "30.5",
        },
        {
          first_name: "Alex",
          last_name: "Jones",
          department: "Fire Department",
          job_title: "Captain",
          hourly_rate: "55",
        },
      ],
    } as unknown as Response);

    const result = await ingestSeattleWages({ firstName: "Jane", lastName: "Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("data.seattle.gov/resource/2khk-5ukd.json");
    expect(requestedUrl).toContain("SMITH");
    // Only Jane Smith matches the required tokens; Alex Jones is filtered out.
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.fullName).toBe("Jane Smith");
    expect(profile.aliases).toContain("Parks and Recreation");
    expect(profile.aliases).toContain("Hourly wage: $30.50");
  });

  it("returns zero without fetching when no name is provided", async () => {
    const result = await ingestSeattleWages({ limit: 5 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
  });

  it("rejects when the request is not ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => [],
    } as unknown as Response);

    await expect(
      ingestSeattleWages({ lastName: "Smith" }),
    ).rejects.toThrow(/Seattle employee wages request failed: 500/);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
