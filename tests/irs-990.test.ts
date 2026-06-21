import { beforeEach, describe, expect, it, vi } from "vitest";
import { deflateRawSync } from "node:zlib";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));
vi.mock("fs", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

import { readFileSync } from "fs";
import { upsertProfile, upsertApprovedSource } from "@/lib/db";
import {
  extractIrs990XmlEntriesFromZip,
  ingestIrs990OfficersFromFile,
  ingestIrs990OfficersFromZip,
  mapIrs990OfficersToProfileInputs,
  parseIrs990Filing,
} from "@/lib/sources/irs-990";

const sampleXml = `<?xml version="1.0"?>
<Return>
  <ReturnData>
    <IRS990>
      <BusinessName>
        <BusinessNameLine1Txt>Example Foundation</BusinessNameLine1Txt>
      </BusinessName>
      <USAddress>
        <AddressLine1Txt>100 Charity Way</AddressLine1Txt>
        <CityNm>Austin</CityNm>
        <StateAbbreviationCd>TX</StateAbbreviationCd>
        <ZIPCd>78701</ZIPCd>
      </USAddress>
      <Form990PartVIISectionAGrp>
        <PersonNm>
          <PersonFirstNameTxt>Jordan</PersonFirstNameTxt>
          <PersonLastNameTxt>Lee</PersonLastNameTxt>
        </PersonNm>
        <TitleTxt>President</TitleTxt>
        <ReportableCompFromOrgAmt>120000</ReportableCompFromOrgAmt>
      </Form990PartVIISectionAGrp>
      <Form990PartVIISectionAGrp>
        <PersonNm>
          <PersonFirstNameTxt>Alex</PersonFirstNameTxt>
          <PersonLastNameTxt>Rivera</PersonLastNameTxt>
        </PersonNm>
        <TitleTxt>Treasurer</TitleTxt>
        <ReportableCompFromOrgAmt>60000</ReportableCompFromOrgAmt>
      </Form990PartVIISectionAGrp>
    </IRS990>
  </ReturnData>
</Return>`;

describe("IRS Form 990 officer extraction", () => {
  it("parses Part VII officers and the organization business address", () => {
    const filing = parseIrs990Filing(sampleXml);
    expect(filing.organizationName).toBe("Example Foundation");
    expect(filing.businessAddress).toMatchObject({
      street: "100 Charity Way",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
    expect(filing.officers).toHaveLength(2);
    expect(filing.officers[0]).toMatchObject({
      name: "Jordan Lee",
      title: "President",
      compensation: "120000",
    });
  });

  it("maps officers to nonprofit-context profiles with the business address", () => {
    const filing = parseIrs990Filing(sampleXml);
    const profiles = mapIrs990OfficersToProfileInputs("", filing.officers, {
      organizationName: filing.organizationName,
      businessAddress: filing.businessAddress,
    });
    expect(profiles).toHaveLength(2);
    expect(profiles[0].fullName).toBe("Jordan Lee");
    expect(profiles[0].aliases).toContain(
      "Nonprofit officer of: Example Foundation",
    );
    expect(profiles[0].aliases).toContain("Title: President");
    expect(profiles[0].aliases).toContain("Reportable compensation: $120,000");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "Austin",
      state: "TX",
      kind: "nonprofit business address",
    });
  });

  it("filters officers to the query name when provided", () => {
    const filing = parseIrs990Filing(sampleXml);
    const profiles = mapIrs990OfficersToProfileInputs("Jordan Lee", filing.officers, {
      organizationName: filing.organizationName,
      businessAddress: filing.businessAddress,
    });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jordan Lee");
  });
});

// A realistic IRS e-filed Form 990 XML (Part VII officers/directors section +
// filer business address). Used for the full ingest path below.
const efiledXml = `<?xml version="1.0" encoding="UTF-8"?>
<Return returnVersion="2022v5.0">
  <ReturnHeader>
    <Filer>
      <BusinessName>
        <BusinessNameLine1Txt>Bluebonnet Community Relief Fund</BusinessNameLine1Txt>
      </BusinessName>
      <USAddress>
        <AddressLine1Txt>4400 Shoal Creek Blvd</AddressLine1Txt>
        <CityNm>Austin</CityNm>
        <StateAbbreviationCd>TX</StateAbbreviationCd>
        <ZIPCd>78756</ZIPCd>
      </USAddress>
    </Filer>
  </ReturnHeader>
  <ReturnData>
    <IRS990>
      <Form990PartVIISectionAGrp>
        <PersonNm>
          <PersonFirstNameTxt>Maria</PersonFirstNameTxt>
          <PersonLastNameTxt>Gonzalez</PersonLastNameTxt>
        </PersonNm>
        <TitleTxt>Executive Director</TitleTxt>
        <ReportableCompFromOrgAmt>98500</ReportableCompFromOrgAmt>
      </Form990PartVIISectionAGrp>
      <Form990PartVIISectionAGrp>
        <PersonNm>
          <PersonFirstNameTxt>David</PersonFirstNameTxt>
          <PersonLastNameTxt>O'Connor</PersonLastNameTxt>
        </PersonNm>
        <TitleTxt>Board Chair</TitleTxt>
        <ReportableCompFromOrgAmt>0</ReportableCompFromOrgAmt>
      </Form990PartVIISectionAGrp>
      <Form990PartVIISectionAGrp>
        <PersonNm>
          <PersonFirstNameTxt>Priya</PersonFirstNameTxt>
          <PersonLastNameTxt>Patel</PersonLastNameTxt>
        </PersonNm>
        <TitleTxt>Secretary</TitleTxt>
        <ReportableCompFromOrgAmt>18000</ReportableCompFromOrgAmt>
      </Form990PartVIISectionAGrp>
    </IRS990>
  </ReturnData>
</Return>`;

describe("IRS 990 ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockReset();
  });

  it("reads the file, parses officers, and upserts matching profiles", async () => {
    vi.mocked(readFileSync).mockReturnValue(efiledXml);

    const result = await ingestIrs990OfficersFromFile({
      file: "/tmp/irs_990_2022_bluebonnet.xml",
      query: "Maria Gonzalez",
    });

    expect(result.imported).toBe(1);
    expect(result.fetched).toBe(3);
    expect(result.url).toBe("/tmp/irs_990_2022_bluebonnet.xml");
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);

    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.fullName).toBe("Maria Gonzalez");
    expect(profile.ageRange).toBe("Unknown");
    expect(profile.confidence).toBe("Low");
    expect(profile.aliases).toContain(
      "Nonprofit officer of: Bluebonnet Community Relief Fund",
    );
    expect(profile.aliases).toContain("Title: Executive Director");
    expect(profile.aliases).toContain("Reportable compensation: $98,500");
    expect(profile.locations?.[0]).toMatchObject({
      street: "4400 Shoal Creek Blvd",
      city: "Austin",
      state: "TX",
      zip: "78756",
      kind: "nonprofit business address",
    });
    expect(profile.sourceRecord).toMatchObject({
      sourceId: "irs_form_990_officers",
      raw: { organization: "Bluebonnet Community Relief Fund" },
    });
  });

  it("imports all named officers when no query is given", async () => {
    vi.mocked(readFileSync).mockReturnValue(efiledXml);

    const result = await ingestIrs990OfficersFromFile({
      file: "/tmp/irs_990_2022_bluebonnet.xml",
    });

    expect(result.fetched).toBe(3);
    expect(result.imported).toBe(3);
    expect(upsertProfile).toHaveBeenCalledTimes(3);
    const names = vi
      .mocked(upsertProfile)
      .mock.calls.map((call) => call[0].fullName);
    expect(names).toEqual(
      expect.arrayContaining([
        "Maria Gonzalez",
        "David O'Connor",
        "Priya Patel",
      ]),
    );
    // Decoded XML entity (&apos; -> ') and compensation formatting check.
    const oconnor = vi
      .mocked(upsertProfile)
      .mock.calls.find((c) => c[0].fullName === "David O'Connor")![0];
    expect(oconnor.aliases).toContain("Reportable compensation: $0");
  });

  it("returns imported 0 when the query matches no officers", async () => {
    vi.mocked(readFileSync).mockReturnValue(efiledXml);

    const result = await ingestIrs990OfficersFromFile({
      file: "/tmp/irs_990_2022_bluebonnet.xml",
      query: "Nonexistent Person",
    });

    expect(result.imported).toBe(0);
    expect(result.fetched).toBe(3);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("returns imported 0 for an XML file with no Part VII officer blocks", async () => {
    const emptyXml = `<?xml version="1.0"?>
<Return>
  <ReturnHeader>
    <Filer>
      <BusinessName>
        <BusinessNameLine1Txt>Solo Artist Trust</BusinessNameLine1Txt>
      </BusinessName>
      <USAddress>
        <AddressLine1Txt>9 Lone Star Rd</AddressLine1Txt>
        <CityNm>Dallas</CityNm>
        <StateAbbreviationCd>TX</StateAbbreviationCd>
        <ZIPCd>75201</ZIPCd>
      </USAddress>
    </Filer>
  </ReturnHeader>
  <ReturnData>
    <IRS990></IRS990>
  </ReturnData>
</Return>`;
    vi.mocked(readFileSync).mockReturnValue(emptyXml);

    const result = await ingestIrs990OfficersFromFile({
      file: "/tmp/irs_990_solo.xml",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
    // Source is still registered even when no officers are present.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
  });

  it("handles malformed/unparseable XML gracefully without importing", async () => {
    const brokenXml = `<?xml version="1.0"?>
<Return>
  <ReturnData>
    <IRS990><Form990PartVIISectionAGrp><PersonFirstNameTxt>Sam</Pers`;
    vi.mocked(readFileSync).mockReturnValue(brokenXml);

    const result = await ingestIrs990OfficersFromFile({
      file: "/tmp/irs_990_broken.xml",
    });

    // The regex parser yields no complete officer blocks, so nothing imports
    // and no exception escapes the ingest function.
    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("extracts XML entries from a TEOS-style ZIP and ignores non-XML entries", () => {
    const zip = createZip([
      { name: "README.txt", contents: "metadata only" },
      { name: "2026/return-one.xml", contents: sampleXml, deflate: true },
      { name: "return-two.XML", contents: efiledXml },
    ]);

    const entries = extractIrs990XmlEntriesFromZip(zip);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      name: "2026/return-one.xml",
      xml: sampleXml,
    });
    expect(entries[1]).toMatchObject({
      name: "return-two.XML",
      xml: efiledXml,
    });
  });

  it("ingests officers from a ZIP with query, file, and import limits", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      createZip([
        { name: "return-one.xml", contents: sampleXml, deflate: true },
        { name: "return-two.xml", contents: efiledXml },
      ]),
    );

    const result = await ingestIrs990OfficersFromZip({
      zipFile: "/tmp/irs_990_202605.zip",
      query: "Maria Gonzalez",
      limit: 1,
      maxFiles: 2,
    });

    expect(result.files).toBe(2);
    expect(result.fetched).toBe(5);
    expect(result.imported).toBe(1);
    expect(result.url).toBe("/tmp/irs_990_202605.zip");
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.fullName).toBe("Maria Gonzalez");
    expect(profile.id).toContain("return_two_xml_maria_gonzalez_0");
    expect(profile.sourceRecord?.sourceRecordId).toContain(
      "return_two_xml_maria_gonzalez_0",
    );
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
  });
});

function createZip(
  entries: { name: string; contents: string; deflate?: boolean }[],
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.contents);
    const compressed = entry.deflate ? deflateRawSync(data) : data;
    const compressionMethod = entry.deflate ? 8 : 0;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + compressed.length;
  }

  const localData = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localData.length, 16);

  return Buffer.concat([localData, centralDirectory, endRecord]);
}
