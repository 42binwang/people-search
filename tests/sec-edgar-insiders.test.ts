import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertProfile } from "@/lib/db";
import {
  ingestSecEdgarInsiders,
  mapSecEdgarInsiderToProfileInput,
  type SecEdgarInsiderProfileFiling,
} from "@/lib/sources/sec-edgar-insiders";

const baseFiling: SecEdgarInsiderProfileFiling = {
  form: "4",
  adsh: "0001234567-24-000001",
  fileDate: "2024-03-15",
  issuerName: "Acme Corporation",
  issuerCik: "0001234567",
  insiderCik: "0007654321",
  state: "CA",
  location: "San Francisco, CA",
  role: "Chief Financial Officer",
};

describe("SEC EDGAR insiders source mapping", () => {
  it("maps a Form 4 reporting owner to a context profile", () => {
    const profile = mapSecEdgarInsiderToProfileInput(baseFiling, "Jane A Smith");

    expect(profile?.fullName).toBe("Jane A Smith");
    expect(profile?.id).toBe("p_secedgar_jane_a_smith_acme_corporation");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain(
      "Last known institution: Acme Corporation",
    );
    expect(profile?.aliases).toContain("Role: Chief Financial Officer");
    expect(profile?.aliases).toContain("Year: 2024");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Acme Corporation",
      state: "CA",
      kind: "corporate filing affiliation",
    });
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "sec_edgar_insiders",
      sourceRecordId: "0001234567-24-000001__jane_a_smith",
      raw: { filing: baseFiling, matchedInsider: "Jane A Smith" },
    });
  });

  it("falls back to the generic insider role when role is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, role: undefined },
      "Jane A Smith",
    );

    expect(profile?.aliases).toContain(
      "Role: Securities filing insider (Form 3/4/5 reporting owner)",
    );
  });

  it("falls back to the generic insider role when role is blank", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, role: "   " },
      "Jane A Smith",
    );

    expect(profile?.aliases).toContain(
      "Role: Securities filing insider (Form 3/4/5 reporting owner)",
    );
  });

  it("uses US as the fallback state when no issuer state is provided", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, state: undefined },
      "Jane A Smith",
    );

    expect(profile?.locations?.[0]).toMatchObject({
      city: "Acme Corporation",
      state: "US",
    });
  });

  it("drops the location entry when the issuer name is missing", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, issuerName: "" },
      "Jane A Smith",
    );

    expect(profile?.locations).toEqual([]);
    expect(profile?.aliases).not.toContain(
      "Last known institution: Acme Corporation",
    );
  });

  it("builds the record id from the raw issuer when adsh is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, adsh: undefined },
      "Jane A Smith",
    );

    // The no-adsh branch joins the RAW issuer name to the normalized full name.
    expect(profile?.sourceRecord.sourceRecordId).toBe(
      "Acme Corporation__jane_a_smith",
    );
  });

  it("uses an 'issuer' placeholder when adsh is absent and issuer is undefined", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, adsh: undefined, issuerName: undefined },
      "Jane A Smith",
    );

    expect(profile?.sourceRecord.sourceRecordId).toBe("issuer__jane_a_smith");
    expect(profile?.id).toBe("p_secedgar_jane_a_smith_issuer");
  });

  it("produces an empty issuer prefix in the record id when issuer is an empty string", () => {
    // `?? "issuer"` only fires for null/undefined, so an empty-string issuer
    // yields a leading-underscore record id; the `id` still normalizes to
    // `..._issuer` because normalizeKey("") falls back to "unknown" -> dropped.
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, adsh: undefined, issuerName: "" },
      "Jane A Smith",
    );

    expect(profile?.sourceRecord.sourceRecordId).toBe("__jane_a_smith");
  });

  it("omits the Year alias when file_date has no 4-digit year", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, fileDate: "undated" },
      "Jane A Smith",
    );

    expect(profile?.aliases.some((a) => a.startsWith("Year:"))).toBe(false);
  });

  it("omits the Year alias when file_date is absent", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, fileDate: undefined },
      "Jane A Smith",
    );

    expect(profile?.aliases.some((a) => a.startsWith("Year:"))).toBe(false);
  });

  it("normalizes special characters in the profile id and record id", () => {
    const profile = mapSecEdgarInsiderToProfileInput(
      { ...baseFiling, issuerName: "T. Rowe Price Group, Inc." },
      "Mary-Beth O'Neil",
    );

    expect(profile?.id).toBe(
      "p_secedgar_mary_beth_o_neil_t_rowe_price_group_inc",
    );
    expect(profile?.sourceRecord.sourceRecordId).toBe(
      "0001234567-24-000001__mary_beth_o_neil",
    );
  });

  it("returns null when the insider full name is empty", () => {
    expect(mapSecEdgarInsiderToProfileInput(baseFiling, "")).toBeNull();
  });

  it("treats a whitespace-only name as non-empty (guard is truthy, not trimmed)", () => {
    // The `if (!fullName)` guard only rejects falsy values, so a whitespace
    // string passes through and is normalized to "unknown" downstream.
    const profile = mapSecEdgarInsiderToProfileInput(baseFiling, "   ");

    expect(profile).not.toBeNull();
    expect(profile?.fullName).toBe("   ");
    expect(profile?.sourceRecord.sourceRecordId).toBe(
      "0001234567-24-000001__unknown",
    );
    expect(profile?.id).toBe("p_secedgar_acme_corporation");
  });
});

describe("SEC EDGAR insiders ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("fetches EDGAR full-text search, resolves the Form 4 role, and upserts a profile", async () => {
    // Multi-step fetch: (1) the EDGAR FTS JSON, then (2) the Form 4 XML for the
    // reporting-owner relationship. We branch on URL.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: any) => {
        const url =
          typeof input === "string" ? input : (input?.url ?? input?.toString?.() ?? "");
        if (url.startsWith("https://efts.sec.gov/LATEST/search-index")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              hits: {
                hits: [
                  {
                    _id: "0001234567-24-000001:primary_doc.xml",
                    _source: {
                      // Positionally aligned: insider first (person), issuer second (corp).
                      display_names: [
                        "JANE A SMITH (CIK 0007654321)",
                        "ACME CORPORATION (CIK 0001234567)",
                      ],
                      ciks: ["0007654321", "0001234567"],
                      adsh: "0001234567-24-000001",
                      form: "4",
                      file_date: "2024-03-15",
                      biz_states: ["CA"],
                      biz_locations: ["San Francisco, CA"],
                    },
                  },
                ],
              },
            }),
          } as any;
        }
        // Archives Form 4 XML — role resolution path.
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            "<ownershipDocument>" +
            "<reportingOwnerRelationship>" +
            "<isDirector>0</isDirector>" +
            "<isOfficer>1</isOfficer>" +
            "<isTenPercentOwner>0</isTenPercentOwner>" +
            "<officerTitle>Chief Financial Officer</officerTitle>" +
            "</reportingOwnerRelationship>" +
            "</ownershipDocument>",
        } as any;
      });

    const result = await ingestSecEdgarInsiders({
      firstName: "Jane",
      lastName: "Smith",
    });

    // FTS search was called once with the right query/forms params and a UA.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const ftsCall = fetchMock.mock.calls[0];
    const ftsUrl = String(ftsCall[0]);
    expect(ftsUrl.startsWith("https://efts.sec.gov/LATEST/search-index")).toBe(true);
    expect(ftsUrl).toContain("q=Jane+Smith");
    expect(ftsUrl).toContain("forms=3%2C4%2C5");
    expect(ftsCall[1]?.headers).toMatchObject({
      accept: "application/json",
    });
    expect(ftsCall[1]?.headers).toHaveProperty("user-agent");

    // One hit, one profile imported, no token-filter drop.
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.url.startsWith("https://efts.sec.gov/LATEST/search-index")).toBe(
      true,
    );

    // upsertProfile got the mapped profile with the resolved CFO role.
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = (upsertProfile as any).mock.calls[0][0];
    expect(profile.id).toBe("p_secedgar_jane_a_smith_acme_corporation");
    expect(profile.fullName).toBe("JANE A SMITH");
    expect(profile.ageRange).toBe("Unknown");
    expect(profile.confidence).toBe("Medium");
    expect(profile.aliases).toContain("Last known institution: ACME CORPORATION");
    expect(profile.aliases).toContain("Role: Officer (Chief Financial Officer)");
    expect(profile.aliases).toContain("Year: 2024");
    expect(profile.locations).toHaveLength(1);
    expect(profile.locations[0]).toMatchObject({
      city: "ACME CORPORATION",
      state: "CA",
      kind: "corporate filing affiliation",
      sourceId: "sec_edgar_insiders",
    });
    expect(profile.contacts).toEqual([]);
    expect(profile.relationships).toEqual([]);
    expect(profile.sourceRecord).toMatchObject({
      sourceId: "sec_edgar_insiders",
      sourceRecordId: "0001234567-24-000001__jane_a_smith",
      raw: {
        filing: expect.objectContaining({
          form: "4",
          adsh: "0001234567-24-000001",
          issuerName: "ACME CORPORATION",
          role: "Officer (Chief Financial Officer)",
        }),
        matchedInsider: "JANE A SMITH",
      },
    });
  });

  it("imports a profile with the generic role when the per-filing XML fetch fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: any) => {
        const url =
          typeof input === "string" ? input : (input?.url ?? input?.toString?.() ?? "");
        if (url.startsWith("https://efts.sec.gov/LATEST/search-index")) {
          return {
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({
              hits: {
                hits: [
                  {
                    _id: "0001234567-24-000001:primary_doc.xml",
                    _source: {
                      display_names: [
                        "ROBERT LEE (CIK 0007654321)",
                        "ACME CORPORATION (CIK 0001234567)",
                      ],
                      ciks: ["0007654321", "0001234567"],
                      adsh: "0001234567-24-000001",
                      form: "4",
                      file_date: "2024-01-02",
                    },
                  },
                ],
              },
            }),
          } as any;
        }
        // Archives fetch fails — ingest must fall back to generic role, not throw.
        return { ok: false, status: 404, statusText: "Not Found" } as any;
      });

    const result = await ingestSecEdgarInsiders({ query: "Robert Lee" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(1);
    const profile = (upsertProfile as any).mock.calls[0][0];
    expect(profile.fullName).toBe("ROBERT LEE");
    expect(profile.aliases).toContain(
      "Role: Securities filing insider (Form 3/4/5 reporting owner)",
    );
  });

  it("drops hits whose insider name does not match the required query tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        hits: {
          hits: [
            {
              _id: "0001234567-24-000002:primary_doc.xml",
              _source: {
                // Insider name shares no token with the "Jane Smith" query.
                display_names: [
                  "CAROL NGUYEN (CIK 0001111111)",
                  "ACME CORPORATION (CIK 0001234567)",
                ],
                ciks: ["0001111111", "0001234567"],
                adsh: "0001234567-24-000002",
                form: "4",
                file_date: "2024-02-10",
              },
            },
          ],
        },
      }),
    } as any);

    const result = await ingestSecEdgarInsiders({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("returns imported 0 and never fetches when the query is empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const result = await ingestSecEdgarInsiders({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.fetched).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the EDGAR FTS request is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as any);

    await expect(
      ingestSecEdgarInsiders({ firstName: "Jane", lastName: "Smith" }),
    ).rejects.toThrow(/SEC EDGAR full-text search request failed: 500/);

    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("respects the limit option, only importing the capped number of profiles", async () => {
    const hits = [
      {
        _id: "0001234567-24-000010:primary_doc.xml",
        _source: {
          display_names: [
            "JANE SMITH (CIK 0007654321)",
            "ACME CORPORATION (CIK 0001234567)",
          ],
          ciks: ["0007654321", "0001234567"],
          adsh: "0001234567-24-000010",
          form: "4",
          file_date: "2024-03-15",
        },
      },
      {
        _id: "0001234567-24-000011:primary_doc.xml",
        _source: {
          display_names: [
            "JANE SMITH (CIK 0007654321)",
            "BETA HOLDINGS INC (CIK 0002000000)",
          ],
          ciks: ["0007654321", "0002000000"],
          adsh: "0001234567-24-000011",
          form: "4",
          file_date: "2024-03-16",
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url =
        typeof input === "string" ? input : (input?.url ?? input?.toString?.() ?? "");
      if (url.startsWith("https://efts.sec.gov/LATEST/search-index")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ hits: { hits } }),
        } as any;
      }
      return { ok: false, status: 404, statusText: "Not Found" } as any;
    });

    const result = await ingestSecEdgarInsiders({
      firstName: "Jane",
      lastName: "Smith",
      limit: 1,
    });

    // applyImportLimit caps the fetched hits to 1 before processing.
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = (upsertProfile as any).mock.calls[0][0];
    // First hit's issuer is ACME CORPORATION.
    expect(profile.id).toBe("p_secedgar_jane_smith_acme_corporation");
  });
});
