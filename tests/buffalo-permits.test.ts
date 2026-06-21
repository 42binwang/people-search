import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestBuffaloPermits,
  mapBuffaloPermitRowToProfileInput,
  type BuffaloPermitRow,
} from "@/lib/sources/buffalo-permits";

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

describe("Buffalo permits ingest", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(upsertProfile).mockReset();
    vi.mocked(upsertApprovedSource).mockClear();
  });

  it("fetches the Socrata SoQL endpoint with an uppercased surname prefix, maps, and upserts individual applicants", async () => {
    const rows: BuffaloPermitRow[] = [
      {
        apno: "REP21-9533033",
        applicant: "SMITH CLARA L",
        lictype: "HOMEOWNER",
        stname: "190 ORLANDO",
        city: "BUFFALO",
        state: "NY",
        zip: "14210",
        issued: "2021-05-03T00:00:00.000",
        descofwork: "Replace shingle roof.",
      },
      // Contractor / business applicant — must be filtered out, never upserted.
      {
        apno: "REP21-9533999",
        applicant: "ACME PLUMBING LLC",
        lictype: "PLUMBER",
        stname: "1402 MAIN ST",
        city: "BUFFALO",
        state: "NY",
        zip: "14209",
        issued: "2021-06-10T00:00:00.000",
        descofwork: "Rough-in plumbing for residential remodel.",
      },
    ];

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => rows,
    } as unknown as Response);

    const result = await ingestBuffaloPermits({
      lastName: "Smith",
      limit: 5,
    });

    // The adapter uppercases the queried last name for Socrata's
    // case-sensitive starts_with(), so the encoded URL must contain the
    // SMITH-prefix predicate (URLSearchParams encodes $ as %24 and the
    // parens/comma/quotes of the SoQL call).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("data.buffalony.gov/resource/9p2d-f3yt.json");
    expect(requestedUrl).toContain("%24where=starts_with%28applicant%2C%27SMITH%27%29");
    expect(requestedUrl).toContain("%24limit=5");

    // Both rows are fetched, but only the individual applicant is imported.
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);

    // The source is registered exactly once up front.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(upsertApprovedSource).mock.calls[0][0],
    ).toMatchObject({
      id: "buffalo_ny_building_permits",
      category: "Municipal building permit applicant",
      jurisdiction: "Buffalo, NY",
    });

    // Only the individual applicant is upserted — surname-first reordered to
    // "Clara L Smith", Low confidence, and a permit/work-site location kind.
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.id).toBe("p_buffalo_permits_rep21_9533033");
    expect(profile.fullName).toBe("Clara L Smith");
    expect(profile.confidence).toBe("Low");
    expect(profile.aliases).toContain("Buffalo permit #: REP21-9533033");
    expect(profile.aliases).toContain("Permit type: HOMEOWNER");
    expect(profile.locations?.[0]).toMatchObject({
      street: "190 ORLANDO",
      city: "Buffalo",
      state: "NY",
      zip: "14210",
      kind: "building permit applicant (permit/work site; not confirmed residence)",
    });
    expect(profile.sourceRecord?.sourceId).toBe("buffalo_ny_building_permits");
    expect(profile.sourceRecord?.sourceRecordId).toBe("REP21-9533033");
  });

  it("returns zero imported without fetching when no last name is provided", async () => {
    const result = await ingestBuffaloPermits({ limit: 5 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertProfile).not.toHaveBeenCalled();
    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    // The early-return URL is still built (empty surname -> no $where).
    expect(result.url).toContain("9p2d-f3yt.json");
    // Source registration happens before the early return.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
  });

  it("rejects when the Socrata request is not ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => [],
    } as unknown as Response);

    await expect(
      ingestBuffaloPermits({ lastName: "Smith", limit: 5 }),
    ).rejects.toThrow(/Buffalo permits request failed: 500/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
