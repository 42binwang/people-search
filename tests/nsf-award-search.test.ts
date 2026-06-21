import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertProfile, upsertApprovedSource } from "@/lib/db";
import {
  ingestNsfAwards,
  mapNsfAwardToProfileInput,
} from "@/lib/sources/nsf-award-search";

describe("NSF Award Search source mapping", () => {
  it("maps an award PI to a context profile", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 8611317,
        title: "Development of New Software for Genetic Linkage Mapping",
        awardeeName: "Whitehead Institute for Biomedical Research",
        awardeeCountryCode: "US",
        piFirstName: "Eric",
        piLastName: "Lander",
        startDate: "01/15/1987",
        fundsObligatedAmt: 1197532,
      },
      "Eric Lander",
    );

    expect(profile?.id).toBe("p_nsf_eric_lander");
    expect(profile?.fullName).toBe("Eric Lander");
    expect(profile?.aliases).toContain(
      "Last known institution: Whitehead Institute for Biomedical Research",
    );
    expect(profile?.aliases).toContain("Year: 1987");
    expect(profile?.sourceRecord?.sourceId).toBe("nsf_award_search");
    expect(profile?.sourceRecord?.sourceRecordId).toBe("8611317__eric_lander");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Whitehead Institute for Biomedical Research",
      state: "US",
      kind: "scholarly affiliation",
    });
  });

  it("returns null for an empty PI name", () => {
    expect(
      mapNsfAwardToProfileInput(
        { id: 1, title: "Any award", awardeeName: "Any Org" },
        "",
      ),
    ).toBeNull();
  });

  it("parses a 4-digit year from various NSF date formats", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 2,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "2024-06-01",
      },
      "Jane Smith",
    );
    expect(profile?.aliases).toContain("Year: 2024");
  });

  it("sets confidence Medium and ageRange Unknown for a mapped PI", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 3,
        title: "Award",
        awardeeName: "Org",
        awardeeCountryCode: "US",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "2020-01-01",
      },
      "Jane Smith",
    );
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.contacts).toEqual([]);
    expect(profile?.relationships).toEqual([]);
  });

  it("falls back to 'Global' state when awardeeCountryCode is missing but institution is present", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 4,
        title: "Award",
        awardeeName: "University of Toronto",
        piFirstName: "Jane",
        piLastName: "Smith",
      },
      "Jane Smith",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "University of Toronto",
      state: "Global",
      kind: "scholarly affiliation",
    });
  });

  it("omits location and institution alias when awardeeName is missing", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 5,
        title: "Award",
        awardeeCountryCode: "US",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "2018-05-01",
      },
      "Jane Smith",
    );
    expect(profile?.locations).toEqual([]);
    expect(
      profile?.aliases?.some((a) => a.startsWith("Last known institution")),
    ).toBe(false);
    expect(profile?.aliases).toContain("Year: 2018");
  });

  it("omits year alias when startDate is missing or has no 4-digit year", () => {
    const noDate = mapNsfAwardToProfileInput(
      {
        id: 6,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
      },
      "Jane Smith",
    );
    expect(noDate?.aliases?.some((a) => a.startsWith("Year:"))).toBe(false);

    const noYear = mapNsfAwardToProfileInput(
      {
        id: 7,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "TBD",
      },
      "Jane Smith",
    );
    expect(noYear?.aliases?.some((a) => a.startsWith("Year:"))).toBe(false);
  });

  it("extracts the year from a non-ISO date string", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        id: 8,
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
        startDate: "Award started March 2021",
      },
      "Jane Smith",
    );
    expect(profile?.aliases).toContain("Year: 2021");
  });

  it("uses the 'award' placeholder when award id is absent", () => {
    const profile = mapNsfAwardToProfileInput(
      {
        title: "Award",
        awardeeName: "Org",
        piFirstName: "Jane",
        piLastName: "Smith",
      },
      "Jane Smith",
    );
    expect(profile?.sourceRecord?.sourceRecordId).toBe("award__jane_smith");
  });

  it("maps a minimal award with only institution context when fullName is present", () => {
    const profile = mapNsfAwardToProfileInput(
      { awardeeName: "MIT", awardeeCountryCode: "US" },
      "Jane Smith",
    );
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.locations?.[0]?.city).toBe("MIT");
    expect(profile?.aliases).toEqual(["Last known institution: MIT"]);
  });
});

describe("NSF award ingest", () => {
  const NSF_URL = "https://api.nsf.gov/services/v1/awards.json";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the NSF awards endpoint and imports one profile per matching PI", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          award: [
            {
              id: 8611317,
              title: "Development of New Software for Genetic Linkage Mapping",
              awardeeName: "Whitehead Institute for Biomedical Research",
              awardeeCountryCode: "US",
              piFirstName: "Jane",
              piLastName: "Smith",
              startDate: "01/15/1987",
              fundsObligatedAmt: 1197532,
            },
            {
              id: 9999999,
              title: "Unrelated award with a different PI",
              awardeeName: "Stanford University",
              awardeeCountryCode: "US",
              piFirstName: "Alan",
              piLastName: "Turing",
              startDate: "2019-09-01",
            },
          ],
        },
      }),
    } as unknown as Response);

    const result = await ingestNsfAwards({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(NSF_URL);
    expect(url).toContain("piFirstName=Jane");
    expect(url).toContain("piLastName=Smith");
    expect(url).toContain("offset=0");
    expect((init as RequestInit)?.cache).toBe("no-store");

    // 2 awards fetched, only the Jane Smith PI passes the name-token filter.
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.url.startsWith(NSF_URL)).toBe(true);

    // The matching PI was upserted with a correctly mapped profile.
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = (
      vi.mocked(upsertProfile)
    ).mock.calls[0][0];
    expect(profile.id).toBe("p_nsf_jane_smith");
    expect(profile.fullName).toBe("Jane Smith");
    expect(profile.confidence).toBe("Medium");
    expect(profile.ageRange).toBe("Unknown");
    expect(profile.aliases).toContain(
      "Last known institution: Whitehead Institute for Biomedical Research",
    );
    expect(profile.aliases).toContain("Year: 1987");
    expect(profile.sourceRecord.sourceId).toBe("nsf_award_search");
    expect(profile.sourceRecord.sourceRecordId).toBe("8611317__jane_smith");

    // The source is registered as an approved source.
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "nsf_award_search",
        name: "NSF Award Search API",
      }),
    );

    fetchMock.mockRestore();
  });

  it("dedupes multiple awards sharing the same PI into a single profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          award: [
            {
              id: 111,
              title: "First award",
              awardeeName: "MIT",
              awardeeCountryCode: "US",
              piFirstName: "Jane",
              piLastName: "Smith",
              startDate: "2010-01-01",
            },
            {
              id: 222,
              title: "Second award",
              awardeeName: "Stanford University",
              awardeeCountryCode: "US",
              piFirstName: "Jane",
              piLastName: "Smith",
              startDate: "2015-06-01",
            },
          ],
        },
      }),
    } as unknown as Response);

    const result = await ingestNsfAwards({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(
      (vi.mocked(upsertProfile)).mock.calls[0][0]
        .id,
    ).toBe("p_nsf_jane_smith");

    fetchMock.mockRestore();
  });

  it("uses the free-form query fallback when firstName/lastName are absent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: {
          award: [
            {
              id: 333,
              title: "Award",
              awardeeName: "MIT",
              piFirstName: "Jane",
              piLastName: "Smith",
              startDate: "2020-01-01",
            },
          ],
        },
      }),
    } as unknown as Response);

    const result = await ingestNsfAwards({ query: "Jane Smith" });

    const url = fetchMock.mock.calls[0][0] as string;
    // splitQuery/tokenizeName lowercases tokens; first token -> piFirstName,
    // remaining tokens -> piLastName.
    expect(url).toContain("piFirstName=jane");
    expect(url).toContain("piLastName=smith");
    expect(result.imported).toBe(1);

    fetchMock.mockRestore();
  });

  it("returns imported 0 without throwing when the response has no awards", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: { award: [] } }),
    } as unknown as Response);

    const result = await ingestNsfAwards({
      firstName: "Jane",
      lastName: "Smith",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("throws when the endpoint returns a non-ok status", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as unknown as Response);

    await expect(
      ingestNsfAwards({ firstName: "Jane", lastName: "Smith" }),
    ).rejects.toThrow(/NSF Award Search request failed: 500/);

    expect(upsertProfile).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("returns imported 0 when no name tokens are provided", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await ingestNsfAwards({});

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
