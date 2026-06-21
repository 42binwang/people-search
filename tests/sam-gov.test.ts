import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

import { upsertProfile } from "@/lib/db";
import {
  ingestSamGovEntities,
  mapSamGovEntityToProfileInputs,
} from "@/lib/sources/sam-gov";

const ENDPOINT = "https://api.sam.gov/entityinfo/v1/entities";

const entity = {
  entityRegistration: { legalBusinessName: "Example LLC", entityEFTIndicator: "EX1" },
  coreData: {
    physicalAddress: {
      addressLine1: "1 Contractor Plaza",
      city: "Denver",
      stateOrProvince: "CO",
      zip: "80202",
      country: "USA",
    },
    registrationExpirationDate: "2026-12-31",
    electronicBusinessPoc: {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan@example-llc.test",
      usPhone: "+13035550100",
    },
    mailingPoc: {
      firstName: "Jordan",
      lastName: "Lee",
      email: "jordan@example-llc.test",
    },
  },
};

describe("SAM.gov entity -> POC mapping", () => {
  it("extracts public POC contacts (email + phone) from an entity", () => {
    const profiles = mapSamGovEntityToProfileInputs(entity);
    expect(profiles).toHaveLength(2);

    const poc = profiles[0];
    expect(poc.fullName).toBe("Jordan Lee");
    expect(poc.aliases).toContain("SAM.gov POC for: Example LLC");
    expect(poc.locations?.[0]).toMatchObject({
      city: "Denver",
      state: "CO",
      kind: "federal contractor business address",
    });
    const emails = poc.contacts?.filter((c) => c.type === "email") ?? [];
    const phones = poc.contacts?.filter((c) => c.type === "phone") ?? [];
    expect(emails[0]).toMatchObject({ value: "jordan@example-llc.test" });
    expect(phones[0]).toMatchObject({ value: "+13035550100" });
  });

  it("skips entities whose POC lacks a name", () => {
    const noName = {
      coreData: { electronicBusinessPoc: { email: "x@example.test" } },
    };
    expect(mapSamGovEntityToProfileInputs(noName)).toEqual([]);
  });
});

describe("SAM.gov ingest", () => {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(upsertProfile).mockReset();
    delete process.env.SAM_GOV_API_KEY;
  });

  afterEach(() => {
    delete process.env.SAM_GOV_API_KEY;
  });

  it("returns fetched:0 without calling fetch when no API key is provided", async () => {
    const result = await ingestSamGovEntities({ query: "Example LLC" });

    expect(result).toEqual({ fetched: 0, imported: 0, url: ENDPOINT });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("fetches entities and imports mapped POC profiles when an API key is supplied", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entityData: [entity] }),
    } as any);

    const result = await ingestSamGovEntities({
      query: "Example LLC",
      apiKey: "test-key",
    });

    // The real adapter calls fetch once against the SAM.gov entity endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(ENDPOINT);
    expect(String(url)).toContain("legalBusinessName=Example+LLC");
    expect(String(url)).toContain("api_key=test-key");
    expect(String(url)).toContain("registrationStatus=A");
    expect(init).toMatchObject({
      headers: {
        accept: "application/json",
        "user-agent": "PeopleSearchSamGovIngest/0.1 local-development",
      },
      cache: "no-store",
    });

    // The fixture has two named POCs, so two profiles should be imported.
    expect(result.fetched).toBe(1);
    expect(result.imported).toBe(2);
    expect(result.url).toContain(ENDPOINT);
    expect(result.url).toContain("api_key=test-key");
    expect(upsertProfile).toHaveBeenCalledTimes(2);

    const firstProfile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(firstProfile.fullName).toBe("Jordan Lee");
    expect(firstProfile.id).toBe("p_sam_gov_jordan_lee_example_llc");
    expect(firstProfile.aliases).toContain("SAM.gov POC for: Example LLC");
    expect(firstProfile.aliases).toContain("Registration: EX1");
    expect(firstProfile.aliases).toContain("Registration expires: 2026-12-31");
    expect(firstProfile.locations?.[0]).toMatchObject({
      city: "Denver",
      state: "CO",
      kind: "federal contractor business address",
      sourceId: "sam_gov_entity_registrations",
    });
    expect(firstProfile.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "email",
          value: "jordan@example-llc.test",
          sourceId: "sam_gov_entity_registrations",
        }),
        expect.objectContaining({
          type: "phone",
          value: "+13035550100",
          sourceId: "sam_gov_entity_registrations",
        }),
      ]),
    );
    expect(firstProfile.sourceRecord).toMatchObject({
      sourceId: "sam_gov_entity_registrations",
      sourceRecordId: "Example LLC:Jordan Lee",
    });
    expect(firstProfile.sourceRecord?.raw).toBe(entity);
  });

  it("imports zero profiles when the response contains no entityData", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as any);

    const result = await ingestSamGovEntities({
      query: "No Such Company",
      apiKey: "test-key",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("throws when the API responds with an error status", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as any);

    await expect(
      ingestSamGovEntities({ query: "Example LLC", apiKey: "test-key" }),
    ).rejects.toThrow(/SAM\.gov request failed: 500/);

    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("can resolve the API key from the SAM_GOV_API_KEY env var", async () => {
    process.env.SAM_GOV_API_KEY = "env-key";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entityData: [] }),
    } as any);

    const result = await ingestSamGovEntities({ query: "Example LLC" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("api_key=env-key");
    expect(result.imported).toBe(0);
  });
});
