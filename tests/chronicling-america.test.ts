import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestChroniclingAmerica,
  mapChroniclingAmericaItemToProfileInput,
} from "@/lib/sources/chronicling-america";

describe("Chronicling America source mapping", () => {
  it("maps a newspaper page to a context profile", () => {
    const profile = mapChroniclingAmericaItemToProfileInput(
      {
        id: "http://www.loc.gov/resource/sn89081128/1915-02-10/ed-1/?sp=15",
        title: "Image 15 of New Ulm Review (New Ulm, Minn.), February 10, 1915",
        date: "1915-02-10",
        partof_title: "new ulm review (new ulm, brown county, minn.) 1892-1961",
        location_city: ["new ulm"],
        location_state: ["minnesota"],
        location_country: ["united states"],
        description: ["Abraham Lincoln was remembered today in ceremony"],
      },
      "Abraham Lincoln",
    );

    expect(profile?.id).toBe("p_chroniclingamerica_abraham_lincoln");
    expect(profile?.fullName).toBe("Abraham Lincoln");
    expect(profile?.aliases).toContain("1915-02-10");
    expect(profile?.aliases?.[0]).toMatch(/new ulm review/i);
    expect(profile?.confidence).toBe("Low");
    expect(profile?.sourceRecord?.sourceId).toBe("chronicling_america_obituaries");
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedName: "Abraham Lincoln",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "new ulm",
      state: "minnesota",
      kind: "publication context",
    });
  });

  it("falls back to the page title when partof_title is absent", () => {
    const profile = mapChroniclingAmericaItemToProfileInput(
      {
        id: "http://www.loc.gov/resource/sn1/1865-04-15/ed-1/?sp=1",
        title:
          "Image 1 of The Daily Dispatch (Richmond, Va.), April 15, 1865",
        date: "1865-04-15",
        location_state: ["virginia"],
      },
      "John Smith",
    );

    expect(profile?.fullName).toBe("John Smith");
    expect(profile?.aliases?.[0]).toMatch(/daily dispatch/i);
    expect(profile?.locations?.[0]).toMatchObject({
      kind: "publication context",
    });
  });

  it("skips items without a name", () => {
    expect(
      mapChroniclingAmericaItemToProfileInput(
        {
          id: "http://www.loc.gov/resource/x/1900-01-01/ed-1/?sp=1",
          title: "Image 1 of Some Paper",
          date: "1900-01-01",
        },
        "",
      ),
    ).toBeNull();
  });
});

describe("Chronicling America ingest", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches the loc.gov collection and imports one profile per matched name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "http://www.loc.gov/resource/sn89081128/1865-04-15/ed-1/?sp=12",
            title:
              "Image 12 of The Daily Dispatch (Richmond, Va.), April 15, 1865",
            date: "1865-04-15",
            partof_title:
              "the daily dispatch. (richmond, va.) 1884-1914",
            location_city: ["richmond"],
            location_state: ["virginia"],
            location_country: ["united states"],
            description: [
              "Abraham Lincoln addressed the crowd; Lincoln was praised by all.",
            ],
          },
          {
            id: "http://www.loc.gov/resource/sn2/1865-04-15/ed-1/?sp=1",
            title: "Image 1 of Another Paper, April 15, 1865",
            date: "1865-04-15",
            description: ["A totally unrelated article about the weather."],
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestChroniclingAmerica({
      firstName: "Abraham",
      lastName: "Lincoln",
      limit: 100,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.hostname).toBe("www.loc.gov");
    expect(requestedUrl.pathname).toBe(
      "/collections/chronicling-america/",
    );
    expect(requestedUrl.searchParams.get("fo")).toBe("json");
    expect(requestedUrl.searchParams.get("q")).toBe("Abraham Lincoln");
    expect(requestedUrl.searchParams.get("c")).toBe("100");

    // Only the OCR hit mentioning the full name survived strict token filtering.
    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(1);
    expect(result.url).toContain("www.loc.gov");

    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);

    const profile = dbMocks.upsertProfile.mock.calls[0]?.[0];
    expect(profile.id).toBe("p_chroniclingamerica_abraham_lincoln");
    expect(profile.fullName).toBe("Abraham Lincoln");
    expect(profile.ageRange).toBe("Unknown");
    expect(profile.confidence).toBe("Low");
    expect(profile.contacts).toEqual([]);
    expect(profile.relationships).toEqual([]);
    expect(profile.aliases).toContain("1865-04-15");
    expect(profile.aliases?.[0]).toMatch(/daily dispatch/i);
    expect(profile.locations?.[0]).toMatchObject({
      city: "richmond",
      state: "virginia",
      kind: "publication context",
      sourceId: "chronicling_america_obituaries",
    });
    expect(profile.sourceRecord).toMatchObject({
      sourceId: "chronicling_america_obituaries",
    });
    expect(profile.sourceRecord?.raw).toMatchObject({
      matchedName: "Abraham Lincoln",
    });
  });

  it("imports nothing when no OCR pages contain the required name tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            id: "http://www.loc.gov/resource/sn3/1900-01-01/ed-1/?sp=2",
            title: "Image 2 of Some Paper, January 1, 1900",
            date: "1900-01-01",
            location_state: ["new york"],
            description: ["Local market prices and shipping news only."],
          },
        ],
      }),
    } as unknown as Response);

    const result = await ingestChroniclingAmerica({
      firstName: "Abraham",
      lastName: "Lincoln",
    });

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(0);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the loc.gov request is not ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({}),
    } as unknown as Response);

    await expect(
      ingestChroniclingAmerica({ firstName: "Abraham", lastName: "Lincoln" }),
    ).rejects.toThrow(/Chronicling America request failed: 503/);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });
});
