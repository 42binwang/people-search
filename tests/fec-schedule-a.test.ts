import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestFecScheduleAContributions,
  mapFecContributionToProfileInput,
} from "@/lib/sources/fec-schedule-a";

describe("FEC Schedule A source mapping", () => {
  it("maps a contribution to a medium-confidence profile with address", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_first_name: "Bin",
      contributor_last_name: "Wang",
      contributor_street_1: "1052 S Delaware St",
      contributor_city: "San Mateo",
      contributor_state: "CA",
      contributor_zip: "94402",
      contributor_occupation: "Data Analyst",
      contributor_employer: "Tipping Point Community",
      contribution_receipt_date: "2024-10-31",
      contribution_receipt_amount: 5,
      committee: {
        committee_id: "C00401224",
        committee_name: "Blue to the Future 2024",
      },
    });

    expect(profile?.fullName).toBe("Bin Wang");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "1052 S Delaware St",
      city: "San Mateo",
      state: "CA",
      zip: "94402",
      kind: "campaign contribution address",
    });
    expect(profile?.aliases).toContain("Occupation: Data Analyst");
    expect(profile?.aliases).toContain(
      "Employer: Tipping Point Community",
    );
    expect(profile?.aliases).toContain(
      "Contributed to: Blue to the Future 2024",
    );
  });

  it("derives a stable record id from contributor name and address", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_first_name: "Bin",
      contributor_last_name: "Wang",
      contributor_street_1: "1052 S Delaware St",
      contributor_city: "San Mateo",
      contributor_state: "CA",
      contributor_zip: "94402",
    });

    expect(profile?.id).toBe("p_fec_ind_wang_bin_1052_s_delaware_st_san_mateo_ca_94402");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "wang_bin_1052_s_delaware_st_san_mateo_ca_94402",
    );
  });

  it("returns null when city or state is missing", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_first_name: "Bin",
      contributor_last_name: "Wang",
      contributor_city: "",
      contributor_state: "CA",
    });

    expect(profile).toBeNull();
  });

  it("falls back to the contributor_name field when first/last are blank", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_name: "WANG, BIN",
      contributor_city: "San Jose",
      contributor_state: "CA",
      contributor_zip: "95110",
    });

    expect(profile?.fullName).toBe("Bin Wang");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "San Jose",
      state: "CA",
    });
  });
});

describe("FEC Schedule A ingest", () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GETs the OpenFEC Schedule A endpoint, parses results, and upserts mapped contributor profiles", async () => {
    const expectedUrl =
      "https://api.open.fec.gov/v1/schedules/schedule_a/?contributor_name=Wang&api_key=DEMO_KEY";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            contributor_first_name: "Bin",
            contributor_last_name: "Wang",
            contributor_street_1: "1052 S Delaware St",
            contributor_city: "San Mateo",
            contributor_state: "CA",
            contributor_zip: "94402",
            contributor_occupation: "Data Analyst",
            contributor_employer: "Tipping Point Community",
            contribution_receipt_date: "2024-10-31",
            contribution_receipt_amount: 5,
            report_year: 2024,
            committee: {
              committee_id: "C00401224",
              committee_name: "Blue to the Future 2024",
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestFecScheduleAContributions({ query: "Wang" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(expectedUrl);
    expect(init?.method).toBeUndefined();
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["accept"]).toBe("application/json");
    // No api_key supplied -> adapter falls back to the DEMO_KEY default.
    expect(calledUrl).toContain("api_key=DEMO_KEY");

    expect(result.fetched).toBe(1);
    expect(result.imported).toBeGreaterThan(0);
    expect(result.url).toBe(expectedUrl);

    // The contributor is upserted exactly once with a correctly-mapped profile.
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = (upsertProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(profile).toMatchObject({
      id: "p_fec_ind_wang_bin_1052_s_delaware_st_san_mateo_ca_94402",
      fullName: "Bin Wang",
      confidence: "Medium",
    });
    expect(profile.locations[0]).toMatchObject({
      street: "1052 S Delaware St",
      city: "San Mateo",
      state: "CA",
      zip: "94402",
      kind: "campaign contribution address",
      sourceId: "fec_openfec_schedule_a",
    });
    expect(profile.aliases).toContain("Occupation: Data Analyst");
    expect(profile.aliases).toContain("Employer: Tipping Point Community");
    expect(profile.aliases).toContain(
      "Contributed to: Blue to the Future 2024",
    );
    expect(profile.aliases).toContain("Contribution date: 2024-10-31");
    expect(profile.sourceRecord).toMatchObject({
      sourceId: "fec_openfec_schedule_a",
      sourceRecordId:
        "wang_bin_1052_s_delaware_st_san_mateo_ca_94402",
    });

    // The approved source is registered on ingest.
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "fec_openfec_schedule_a",
        acquisitionMethod: "official_api",
      }),
    );
  });

  it("skips contributions that cannot be mapped (missing city/state) but still reports them as fetched", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            // No city/state -> buildContributorLocation returns null -> mapped to null -> skipped.
            contributor_first_name: "Anon",
            contributor_last_name: "Donor",
            contributor_state: "CA",
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestFecScheduleAContributions({
      query: "Nobody",
      apiKey: "test-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("clamps an explicit limit into per_page and caps the number of imported records", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            contributor_first_name: "A",
            contributor_last_name: "Wang",
            contributor_city: "San Mateo",
            contributor_state: "CA",
          },
          {
            contributor_first_name: "B",
            contributor_last_name: "Wang",
            contributor_city: "San Mateo",
            contributor_state: "CA",
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestFecScheduleAContributions({
      query: "Wang",
      limit: 1,
      apiKey: "test-key",
    });

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toContain("per_page=1");
    // applyImportLimit slices to the clamped limit before mapping.
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({}),
    } as unknown as Response);

    await expect(
      ingestFecScheduleAContributions({ query: "Wang" }),
    ).rejects.toThrow(/FEC Schedule A request failed: 429/);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("returns imported 0 when the API returns no results", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    const result = await ingestFecScheduleAContributions({
      query: "Wang",
      apiKey: "test-key",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("serializes state and city filters (uppercased) into the OpenFEC query string", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    const result = await ingestFecScheduleAContributions({
      query: "Wang",
      state: "ca",
      city: "san mateo",
      apiKey: "test-key",
    });

    expect(result.url).toContain("contributor_state=CA");
    expect(result.url).toContain("contributor_city=SAN+MATEO");
  });
});
