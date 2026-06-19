import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestOpendatasoftRecords,
  mapOpendatasoftRecordToProfileInput,
} from "@/lib/sources/opendatasoft";

const source = {
  sourceId: "county_parcel_opendatasoft",
  fields: {
    recordId: "parcel_id",
    name: "owner_name",
    street: "site_address",
    city: "site_city",
    state: "site_state",
    zip: "site_zip",
    updatedAt: "record_updated",
  },
};

describe("Opendatasoft source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved Opendatasoft records and imports mapped profiles", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              parcel_id: "ODS-44",
              owner_name: "ALEX RIVERA",
              site_address: "500 PINE RD",
              site_city: "RALEIGH",
              site_state: "nc",
              site_zip: "27601",
            },
          ],
        }),
      ),
    );

    const result = await ingestOpendatasoftRecords({
      sourceId: source.sourceId,
      sourceName: "County Parcel Opendatasoft",
      jurisdiction: "Test County",
      domain: "open.example.test",
      datasetId: "parcels",
      fields: source.fields,
      query: "Alex Rivera",
      apiKey: "SECRET",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe(
      "/api/explore/v2.1/catalog/datasets/parcels/records",
    );
    expect(requestedUrl.searchParams.get("q")).toBe("Alex Rivera");
    expect(requestedUrl.searchParams.get("apikey")).toBe("SECRET");
    expect(result.url).toContain("apikey=REDACTED");
    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("maps approved records to public property record profiles", () => {
    const profile = mapOpendatasoftRecordToProfileInput(
      {
        parcel_id: "ODS-44",
        owner_name: "ALEX RIVERA",
        site_address: "500 PINE RD",
        site_city: "RALEIGH",
        site_state: "nc",
        site_zip: "27601",
        record_updated: "2026-04-05",
      },
      source,
    );

    expect(profile?.id).toBe("p_county_parcel_opendatasoft_ods_44");
    expect(profile?.fullName).toBe("Alex Rivera");
    expect(profile?.aliases).toContain("Source updated: 2026-04-05");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "500 PINE RD",
      city: "Raleigh",
      state: "NC",
      zip: "27601",
      kind: "public property record",
      sourceId: "county_parcel_opendatasoft",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_parcel_opendatasoft",
      sourceRecordId: "ODS-44",
    });
  });

  it("skips records without required identity or address fields", () => {
    expect(
      mapOpendatasoftRecordToProfileInput(
        {
          parcel_id: "ODS-44",
          owner_name: "Alex Rivera",
          site_state: "NC",
        },
        source,
      ),
    ).toBeNull();
  });
});
