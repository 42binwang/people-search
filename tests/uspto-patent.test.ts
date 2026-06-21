import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestUsptoPatentInventors,
  mapPatentToProfileInputs,
} from "@/lib/sources/uspto-patent";

const patent = {
  patent_number: "10000001",
  patent_title: "Example widget assembly",
  inventors: [
    {
      inventor_first_name: "Jordan",
      inventor_last_name: "Lee",
      inventor_city: "Austin",
      inventor_state: "TX",
    },
    {
      inventor_first_name: "Alex",
      inventor_last_name: "Rivera",
      inventor_city: "Denver",
      inventor_state: "CO",
    },
  ],
  assignees: [{ assignee_organization: "Example Corp" }],
};

describe("USPTO patent inventors source mapping", () => {
  it("maps a matching inventor to a patent-context profile", () => {
    const profiles = mapPatentToProfileInputs("Jordan Lee", patent);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jordan Lee");
    expect(profiles[0].aliases).toContain("Patent: Example widget assembly");
    expect(profiles[0].aliases).toContain("Patent number: 10000001");
    expect(profiles[0].aliases).toContain("Assignee: Example Corp");
    expect(profiles[0].aliases).toContain("Inventor location: Austin, TX");
    // Imprecise city/state is context, not a residential location.
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "USPTO Patents",
      state: "Global",
      kind: "patent inventor context",
    });
    expect(profiles[0].contacts).toEqual([]);
  });

  it("skips inventors that do not match the query", () => {
    expect(mapPatentToProfileInputs("Nobody Match", patent)).toEqual([]);
  });

  it("returns nothing for patents without a number", () => {
    expect(
      mapPatentToProfileInputs("Jordan Lee", { ...patent, patent_number: undefined }),
    ).toEqual([]);
  });
});

const ORIGINAL_ENV = { ...process.env };

// Realistic PatentsView response shape: a top-level `patents` array where each
// patent nests its inventors and assignees. The adapter POSTs a query for the
// inventor's last name and reads exactly this structure.
const matchingPatent = {
  patent_number: "11234567",
  patent_title: "Modular photovoltaic roof tile",
  inventors: [
    {
      inventor_first_name: "Jane",
      inventor_last_name: "Smith",
      inventor_city: "San Jose",
      inventor_state: "CA",
    },
    {
      inventor_first_name: "Wei",
      inventor_last_name: "Zhang",
      inventor_city: "Portland",
      inventor_state: "OR",
    },
  ],
  assignees: [{ assignee_organization: "SunPanel Technologies Inc." }],
};

function buildPayload(patents: typeof matchingPatent[]) {
  // Mirrors the live PatentsView wrapper shape the adapter's types expect.
  return {
    patents,
    total_patent_results: patents.length,
  };
}

describe("USPTO patent ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PATENTSVIEW_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("fetches, maps, and upserts only the name-matching inventor with an explicit apiKey", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => buildPayload([matchingPatent]),
      } as any);

    const result = await ingestUsptoPatentInventors({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.patentsview.org/patents/query");
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-key": "test-key",
        "user-agent": "PeopleSearchUsptoPatentIngest/0.1 local-development",
      },
    });
    // PatentsView query body targets the last name as a phrase; the name is
    // normalized to lowercase by normalizeName before being sent.
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      q: { inventor_last_name: { phrase: "smith" } },
      o: { per_page: 25 },
    });
    expect(body.f).toContain("inventors.inventor_last_name");

    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.url).toBe("https://api.patentsview.org/patents/query");
    expect(upsertProfile).toHaveBeenCalledTimes(1);

    const upserted = upsertProfile.mock.calls[0][0];
    expect(upserted.fullName).toBe("Jane Smith");
    expect(upserted.id).toBe(
      "p_uspto_patent_jane_smith_11234567_0",
    );
    expect(upserted.ageRange).toBe("Unknown");
    expect(upserted.confidence).toBe("Low");
    expect(upserted.aliases).toContain(
      "Patent: Modular photovoltaic roof tile",
    );
    expect(upserted.aliases).toContain("Patent number: 11234567");
    expect(upserted.aliases).toContain(
      "Assignee: SunPanel Technologies Inc.",
    );
    expect(upserted.aliases).toContain("Inventor location: San Jose, CA");
    // Imprecise inventor city/state is context, not residential evidence.
    expect(upserted.locations?.[0]).toMatchObject({
      city: "USPTO Patents",
      state: "Global",
      kind: "patent inventor context",
    });
    expect(upserted.contacts).toEqual([]);
    expect(upserted.relationships).toEqual([]);
    expect(upserted.sourceRecord).toMatchObject({
      sourceId: "uspto_patent_inventors",
      sourceRecordId: "11234567:0",
    });
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "uspto_patent_inventors" }),
    );
  });

  it("falls back to PATENTSVIEW_API_KEY env var when no apiKey is passed", async () => {
    process.env.PATENTSVIEW_API_KEY = "env-key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => buildPayload([matchingPatent]),
      } as any);

    const result = await ingestUsptoPatentInventors({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      "env-key",
    );
    expect(result.imported).toBe(1);
  });

  it("still fetches when no key is available (omits the x-api-key header)", async () => {
    // Unlike the trademark adapter, the patent adapter has no key-gated
    // early return: it simply sends the request without an x-api-key header.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => buildPayload([]),
      } as any);

    const result = await ingestUsptoPatentInventors({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["x-api-key"]).toBeUndefined();
    expect(result).toEqual({
      fetched: 0,
      imported: 0,
      url: "https://api.patentsview.org/patents/query",
    });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("returns zero results without fetching when the query has no last name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await ingestUsptoPatentInventors({
      query: "   ",
      apiKey: "test-key",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      fetched: 0,
      imported: 0,
      url: "https://api.patentsview.org/patents/query",
    });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the PatentsView request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as any);

    await expect(
      ingestUsptoPatentInventors({ query: "Jane Smith", apiKey: "test-key" }),
    ).rejects.toThrow(/PatentsView request failed: 503 Service Unavailable/);

    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("counts only name-matching inventors toward imported across multiple patents", async () => {
    const patents = [
      matchingPatent,
      {
        patent_number: "10987654",
        patent_title: "High-efficiency battery cell",
        inventors: [
          {
            inventor_first_name: "Jane",
            inventor_last_name: "Smith",
            inventor_city: "Austin",
            inventor_state: "TX",
          },
        ],
        assignees: [{ assignee_organization: "VoltCore Labs" }],
      },
      {
        patent_number: "10555555",
        patent_title: "Unrelated carbon-fiber frame",
        inventors: [
          {
            inventor_first_name: "Dana",
            inventor_last_name: "White",
            inventor_city: "Boulder",
            inventor_state: "CO",
          },
        ],
        assignees: [],
      },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildPayload(patents),
    } as any);

    const result = await ingestUsptoPatentInventors({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(result.fetched).toBe(3);
    expect(result.imported).toBe(2);
    expect(upsertProfile).toHaveBeenCalledTimes(2);
    expect(upsertProfile.mock.calls[0][0].fullName).toBe("Jane Smith");
    expect(upsertProfile.mock.calls[1][0].fullName).toBe("Jane Smith");
  });

  it("respects the requested limit when clamping patents", async () => {
    const patents = Array.from({ length: 4 }, (_, i) => ({
      ...matchingPatent,
      patent_number: String(11234567 + i),
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildPayload(patents),
    } as any);

    const result = await ingestUsptoPatentInventors({
      query: "Jane Smith",
      apiKey: "test-key",
      limit: 2,
    });

    expect(result.fetched).toBe(2);
    expect(result.imported).toBe(2);
    expect(upsertProfile).toHaveBeenCalledTimes(2);
    // per_page in the request body reflects the clamped limit.
    const body = JSON.parse(
      (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit)
        .body as string,
    );
    expect(body.o.per_page).toBe(2);
  });

  it("handles an empty patents result set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildPayload([]),
    } as any);

    const result = await ingestUsptoPatentInventors({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("tolerates a payload missing the patents array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as any);

    const result = await ingestUsptoPatentInventors({
      query: "Jane Smith",
      apiKey: "test-key",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
