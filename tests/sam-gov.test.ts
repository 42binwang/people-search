import { describe, expect, it } from "vitest";
import { mapSamGovEntityToProfileInputs } from "@/lib/sources/sam-gov";

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
