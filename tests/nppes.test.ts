import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestNppes,
  mapNppesResultToProfileInput,
  type NppesResult,
} from "@/lib/sources/nppes";

describe("NPPES source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches NPPES records and imports active individual providers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              number: 1234567890,
              enumeration_type: "NPI-1",
              basic: {
                status: "A",
                first_name: "JANE",
                last_name: "SMITH",
              },
              addresses: [],
            },
            {
              number: 2222222222,
              enumeration_type: "NPI-2",
              basic: { status: "A", name: "ACME CLINIC" },
              addresses: [],
            },
          ],
        }),
      ),
    );

    const result = await ingestNppes({
      firstName: "Jane",
      lastName: "Smith",
      state: "TX",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("first_name")).toBe("Jane");
    expect(requestedUrl.searchParams.get("last_name")).toBe("Smith");
    expect(requestedUrl.searchParams.get("state")).toBe("TX");
    expect(result).toMatchObject({ fetched: 2, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("maps active individual providers to professional profiles", () => {
    const profile = mapNppesResultToProfileInput({
      number: 1234567890,
      enumeration_type: "NPI-1",
      basic: {
        status: "A",
        first_name: "JANE",
        middle_name: "Q",
        last_name: "SMITH",
        name_suffix: "--",
      },
      addresses: [
        {
          address_1: "100 CLINIC WAY",
          address_purpose: "LOCATION",
          city: "AUSTIN",
          country_code: "US",
          postal_code: "787011234",
          state: "TX",
          telephone_number: "512-555-0148",
        },
      ],
      other_names: [
        {
          first_name: "JANIE",
          last_name: "SMITH",
        },
      ],
      taxonomies: [
        {
          desc: "Family Medicine",
          primary: true,
        },
      ],
    } satisfies NppesResult);

    expect(profile?.id).toBe("p_nppes_1234567890");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.aliases).toContain("Janie Smith");
    expect(profile?.aliases).toContain("Professional category: Family Medicine");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Austin",
      state: "TX",
      zip: "78701-1234",
      kind: "professional location",
    });
    expect(profile?.contacts?.[0]).toMatchObject({
      type: "phone",
      value: "512-555-0148",
    });
  });

  it("skips inactive or organizational records", () => {
    expect(
      mapNppesResultToProfileInput({
        number: 1,
        enumeration_type: "NPI-2",
        basic: { status: "A", name: "ACME CLINIC" },
        addresses: [],
      }),
    ).toBeNull();

    expect(
      mapNppesResultToProfileInput({
        number: 2,
        enumeration_type: "NPI-1",
        basic: { status: "I", first_name: "JANE", last_name: "SMITH" },
        addresses: [],
      }),
    ).toBeNull();
  });
});
