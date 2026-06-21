import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestNihReporterProjects,
  mapNihProjectToProfileInputs,
} from "@/lib/sources/nih-reporter";

const project = {
  appl_id: "9085351",
  project_num: "4R01HL116525-04",
  project_title: "SHP2 controls cardiac stress adaptation",
  fiscal_year: "2016",
  award_amount: "365025",
  agency_code: "NIH",
  organization: {
    org_name: "University of Missouri-Columbia",
    org_city: "Columbia",
    org_state: "MO",
  },
  principal_investigators: [
    {
      first_name: "Maike",
      last_name: "Krenz",
      full_name: "Maike  Krenz",
      is_contact_pi: true,
    },
    {
      first_name: "Alex",
      last_name: "Rivera",
      full_name: "Alex Rivera",
      is_contact_pi: false,
    },
  ],
};

describe("NIH RePORTER source mapping", () => {
  it("maps a matching principal investigator to a research-grant context profile", () => {
    const profiles = mapNihProjectToProfileInputs("Maike Krenz", project);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Maike Krenz");
    expect(profiles[0].id).toBe(
      "p_nih_reporter_maike_krenz_9085351_0",
    );
    expect(profiles[0].aliases).toContain(
      "NIH project: SHP2 controls cardiac stress adaptation",
    );
    expect(profiles[0].aliases).toContain("Project number: 4R01HL116525-04");
    expect(profiles[0].aliases).toContain("Fiscal year: 2016");
    expect(profiles[0].aliases).toContain("Award amount: $365,025");
    expect(profiles[0].aliases).toContain(
      "Institution: University of Missouri-Columbia, Columbia, MO",
    );
    // Vanity metrics are never emitted as source notes.
    expect(profiles[0]?.aliases?.some((a) => /cited by/i.test(a))).toBe(false);
    // Institution is a source note, not a residential location.
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "NIH RePORTER",
      state: "Global",
      kind: "federal research grant affiliation",
    });
    expect(profiles[0].contacts).toEqual([]);
  });

  it("skips investigators that do not match the query", () => {
    const profiles = mapNihProjectToProfileInputs("Maike Krenz", project);
    expect(profiles.every((p) => !p.fullName.includes("Rivera"))).toBe(true);
  });

  it("returns nothing when no investigator matches the query", () => {
    expect(mapNihProjectToProfileInputs("Nobody Match", project)).toEqual([]);
  });

  it("returns nothing for projects without an application id", () => {
    expect(
      mapNihProjectToProfileInputs("Maike Krenz", { ...project, appl_id: undefined }),
    ).toEqual([]);
  });
});

describe("NIH RePORTer ingest", () => {
  const searchUrl = "https://api.reporter.nih.gov/v2/projects/search";
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs a pi_names search, parses results, and upserts matching investigators", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { total: 1 },
        results: [
          {
            appl_id: "9085351",
            project_num: "4R01HL116525-04",
            project_title: "SHP2 controls cardiac stress adaptation",
            fiscal_year: 2016,
            award_amount: 365025,
            agency_code: "HL",
            organization: {
              org_name: "University of Missouri-Columbia",
              org_city: "Columbia",
              org_state: "MO",
              org_country: "UNITED STATES",
            },
            principal_investigators: [
              {
                first_name: "Maike",
                last_name: "Krenz",
                full_name: "Maike  Krenz",
                is_contact_pi: true,
              },
              {
                first_name: "Alex",
                last_name: "Rivera",
                full_name: "Alex Rivera",
                is_contact_pi: false,
              },
            ],
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestNihReporterProjects({ query: "Maike Krenz" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(searchUrl);
    expect(init?.method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      offset: 0,
      // normalizeName lowercases the query before splitting into pi_names.
      criteria: { pi_names: [{ last_name: "krenz", first_name: "maike" }] },
    });
    // Default limit is undefined, so it is not serialized into the body.
    expect(body).not.toHaveProperty("limit");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");

    expect(result.imported).toBe(1);
    expect(result.fetched).toBe(1);
    expect(result.url).toBe(searchUrl);

    // Only the matching PI (Krenz, not Rivera) is upserted.
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = (upsertProfile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(profile.id).toBe("p_nih_reporter_maike_krenz_9085351_0");
    expect(profile.fullName).toBe("Maike Krenz");
    expect(profile.aliases).toContain(
      "NIH project: SHP2 controls cardiac stress adaptation",
    );
    expect(profile.aliases).toContain("Fiscal year: 2016");
    expect(profile.aliases).toContain("Award amount: $365,025");
    expect(profile.sourceRecord).toMatchObject({
      sourceId: "nih_reporter",
      sourceRecordId: "9085351:0",
    });

    // The approved source gets registered on ingest.
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "nih_reporter" }),
    );
  });

  it("clamps an explicit limit into the request body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    } as unknown as Response);

    const result = await ingestNihReporterProjects({
      query: "Jane Smith",
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ limit: 5 });
    expect(result.imported).toBe(0);
    expect(result.fetched).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("returns imported 0 without calling fetch when the query has no last name", async () => {
    const result = await ingestNihReporterProjects({ query: "   " });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, imported: 0, url: searchUrl });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as unknown as Response);

    await expect(ingestNihReporterProjects({ query: "Jane Smith" })).rejects.toThrow(
      /NIH RePORTER search failed: 500/,
    );
  });

  it("ignores projects whose principal investigators do not match the query", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            appl_id: "1111111",
            project_title: "Unrelated project",
            principal_investigators: [{ full_name: "Completely Other" }],
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestNihReporterProjects({ query: "Jane Smith" });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
