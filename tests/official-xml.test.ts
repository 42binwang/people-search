import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  extractOfficialXmlRecords,
  ingestOfficialXmlRecords,
  mapOfficialXmlRecordToProfileInput,
} from "@/lib/sources/official-xml";

const source = {
  sourceId: "county_xml_parcels",
  fields: {
    recordId: "parcel.id",
    name: "owner.name",
    street: "site.street",
    city: "site.city",
    state: "site.state",
    zip: "site.zip",
    updatedAt: "meta.updated",
  },
};

const xml = `
<response>
  <records>
    <record>
      <parcel><id>XML-9</id></parcel>
      <owner><name>LEE WONG</name></owner>
      <site>
        <street>9 MAPLE DR</street>
        <city>OMAHA</city>
        <state>ne</state>
        <zip>68102</zip>
      </site>
      <meta><updated>2026-06-02</updated></meta>
    </record>
    <record>
      <parcel><id>XML-10</id></parcel>
      <owner><name></name></owner>
      <site><city>Omaha</city><state>NE</state></site>
    </record>
  </records>
</response>`;

describe("Official XML source mapping", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches approved XML records and imports mapped profiles", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(xml));

    const result = await ingestOfficialXmlRecords({
      sourceId: source.sourceId,
      sourceName: "County XML Parcels",
      jurisdiction: "Test County",
      url: "https://api.example.test/parcels.xml",
      fields: source.fields,
      recordsPath: "response.records.record",
      queryParam: "search",
      query: "Lee Wong",
      limitParam: "limit",
      limit: 10,
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("search")).toBe("Lee Wong");
    expect(requestedUrl.searchParams.get("limit")).toBe("10");
    expect(result).toMatchObject({ fetched: 2, imported: 1 });
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);
  });

  it("extracts records from a configured XML path", () => {
    const records = extractOfficialXmlRecords(xml, "response.records.record");

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      parcel: { id: "XML-9" },
      owner: { name: "LEE WONG" },
    });
  });

  it("maps approved XML records to public property record profiles", () => {
    const [record] = extractOfficialXmlRecords(xml, "response.records.record");
    const profile = mapOfficialXmlRecordToProfileInput(record, source);

    expect(profile?.id).toBe("p_county_xml_parcels_xml_9");
    expect(profile?.fullName).toBe("Lee Wong");
    expect(profile?.aliases).toContain("Source updated: 2026-06-02");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "9 MAPLE DR",
      city: "Omaha",
      state: "NE",
      zip: "68102",
      kind: "public property record",
      sourceId: "county_xml_parcels",
    });
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: "county_xml_parcels",
      sourceRecordId: "XML-9",
    });
  });

  it("skips records without required identity or address fields", () => {
    const [, incomplete] = extractOfficialXmlRecords(
      xml,
      "response.records.record",
    );

    expect(mapOfficialXmlRecordToProfileInput(incomplete, source)).toBeNull();
  });
});
