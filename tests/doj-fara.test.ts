import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestDojFaraRegistrants,
  mapDojFaraRecordToProfileInput,
  type FaraProfileRecord,
} from "@/lib/sources/doj-fara";

describe("DOJ FARA registrant source mapping", () => {
  it("maps a short-form officer to a context profile", () => {
    const record: FaraProfileRecord = {
      registrationNumber: 7685,
      registrantName: "Venture Strategic Inc.",
      date: "2026-01-14T00:00:00",
      role: "short-form registrant officer",
    };

    const profile = mapDojFaraRecordToProfileInput(
      record,
      "Jeffrey Donald Corless",
    );

    expect(profile?.id).toBe("p_farareg_jeffrey_donald_corless");
    expect(profile?.fullName).toBe("Jeffrey Donald Corless");
    expect(profile?.aliases).toContain(
      "FARA registrant firm: Venture Strategic Inc.",
    );
    expect(profile?.aliases).toContain(
      "Role: short-form registrant officer",
    );
    expect(profile?.aliases).toContain("Filing year: 2026");
    expect(profile?.sourceRecord?.sourceId).toBe("doj_fara_registrants");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "7685__jeffrey_donald_corless",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Venture Strategic Inc.",
      state: "US",
      kind: "foreign-agent filing affiliation",
    });
  });

  it("maps an individual foreign-agent registrant", () => {
    const record: FaraProfileRecord = {
      registrationNumber: 7730,
      registrantName: "Fecso, Barbara Ann",
      date: "06/01/2026",
      role: "foreign agent registrant",
    };

    const profile = mapDojFaraRecordToProfileInput(record, "Barbara Ann Fecso");

    expect(profile?.id).toBe("p_farareg_barbara_ann_fecso");
    expect(profile?.fullName).toBe("Barbara Ann Fecso");
    expect(profile?.aliases).toContain(
      "FARA registrant firm: Fecso, Barbara Ann",
    );
    expect(profile?.aliases).toContain("Filing year: 2026");
  });

  it("skips individuals without any name", () => {
    expect(
      mapDojFaraRecordToProfileInput(
        { registrationNumber: 1, registrantName: "Example Firm" },
        "",
      ),
    ).toBeNull();
  });
});

describe("DOJ FARA ingest", () => {
  const FARA_REGISTRANTS_URL = "https://efile.fara.gov/api/v1/Registrants/json";

  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches registrant rosters + short-form officers and imports matched individual profiles", async () => {
    // Realistic FARA shapes per the adapter's types:
    //  - Registrants roster: { REGISTRANTS_ACTIVE: { ROW: [...] } }
    //  - Short-form officers: { ROWSET: { ROW: [...] } } (officer names filed
    //    under a firm registration). We include one individual registrant
    //    ("Last, First") which the adapter treats as the person of record when
    //    no firm markers are present, plus a non-matching firm that the token
    //    filter must drop before any short-form fetch.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      (async (input: RequestInfo | URL) => {
        const url = String(input);

        // Active roster — one non-matching firm + one matching individual.
        if (url === `${FARA_REGISTRANTS_URL}/Active`) {
          return new Response(
            JSON.stringify({
              REGISTRANTS_ACTIVE: {
                ROW: [
                  {
                    Name: "Acme Lobbying LLC",
                    Registration_Number: 7685,
                    Registration_Date: "2026-01-14T00:00:00",
                  },
                  {
                    Name: "Fecso, Barbara Ann",
                    Registration_Number: 7730,
                    Registration_Date: "06/01/2026",
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // Terminated roster — empty.
        if (url === `${FARA_REGISTRANTS_URL}/Terminated`) {
          return new Response(
            JSON.stringify({ REGISTRANTS_TERMINATED: { ROW: [] } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // Short-form officers for the matched individual registration (7730)
        // — none on record, so the adapter falls back to treating the
        // registrant name itself as the person.
        if (
          url ===
          `https://efile.fara.gov/api/v1/ShortFormRegistrants/json/Active/7730`
        ) {
          return new Response(JSON.stringify({ ROWSET: { ROW: [] } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response("not found", { status: 404 });
      }) as unknown as typeof fetch,
    );

    const result = await ingestDojFaraRegistrants({
      firstName: "Barbara",
      lastName: "Fecso",
    });

    // Two roster fetches (Active + Terminated) + one short-form fetch for the
    // single matched registrant. The non-matching firm is dropped by the token
    // filter before any short-form fetch.
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);

    // The individual registrant matched and was imported (short-form was empty,
    // so the adapter treats the "Last, First" registrant name as the person).
    expect(result.imported).toBeGreaterThan(0);
    expect(result.fetched).toBeGreaterThan(0);
    expect(result.url).toBe(FARA_REGISTRANTS_URL);

    // The source should always be registered.
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doj_fara_registrants" }),
    );

    // The imported individual is a correctly-mapped context profile.
    const profile = dbMocks.upsertProfile.mock.calls[0][0];
    expect(profile.fullName).toBe("Barbara Ann Fecso");
    expect(profile.id).toBe("p_farareg_barbara_ann_fecso");
    expect(profile.confidence).toBe("Medium");
    expect(profile.sourceRecord.sourceId).toBe("doj_fara_registrants");
    expect(profile.sourceRecord.sourceRecordId).toBe(
      "7730__barbara_ann_fecso",
    );
  });

  it("skips registrants whose names do not match the supplied filter tokens", async () => {
    // Roster contains only unrelated firms/individuals — none match the
    // supplied "Barbara Fecso" tokens, so nothing should be imported.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${FARA_REGISTRANTS_URL}/Active`) {
          return new Response(
            JSON.stringify({
              REGISTRANTS_ACTIVE: {
                ROW: [
                  {
                    Name: "Acme Lobbying LLC",
                    Registration_Number: 9999,
                    Registration_Date: "2025-11-01",
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url === `${FARA_REGISTRANTS_URL}/Terminated`) {
          return new Response(
            JSON.stringify({ REGISTRANTS_TERMINATED: { ROW: [] } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }) as unknown as typeof fetch,
    );

    const result = await ingestDojFaraRegistrants({
      firstName: "Barbara",
      lastName: "Fecso",
    });

    expect(result.imported).toBe(0);
    expect(result.url).toBe(FARA_REGISTRANTS_URL);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
    // The firm registrant above did not pass the token filter, so its
    // short-form endpoint is never hit.
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
  });

  it("throws / reports failure when the registrant roster request fails", async () => {
    // fetchJson throws on non-ok responses for the primary roster endpoint;
    // { ok:false } from the very first roster fetch must surface as an error
    // rather than silently returning an empty import.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream error", { status: 502 }) as Response,
    );

    await expect(
      ingestDojFaraRegistrants({
        firstName: "Barbara",
        lastName: "Fecso",
      }),
    ).rejects.toThrow(/DOJ FARA request failed/);

    // No profiles should be written when the roster fetch hard-fails.
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });
});
