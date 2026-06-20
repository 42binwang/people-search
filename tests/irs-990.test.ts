import { describe, expect, it } from "vitest";
import {
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
