import { describe, expect, it } from "vitest";
import { mapClinicalTrialStudyToProfileInputs } from "@/lib/sources/clinical-trials";

describe("ClinicalTrials.gov source mapping", () => {
  it("maps matching officials and contacts to clinical research context profiles", () => {
    const profiles = mapClinicalTrialStudyToProfileInputs("Jane Smith", {
      protocolSection: {
        identificationModule: {
          nctId: "NCT00000001",
          briefTitle: "Example Trial",
        },
        contactsLocationsModule: {
          overallOfficials: [
            {
              name: "Jane Smith",
              role: "PRINCIPAL_INVESTIGATOR",
              affiliation: "Example University",
            },
          ],
          locations: [
            {
              facility: "Example Clinic",
              city: "Austin",
              state: "Texas",
              zip: "78701",
              country: "United States",
              contacts: [
                {
                  name: "Jane Smith",
                  role: "CONTACT",
                  phone: "512-555-0101",
                  email: "jane@example.edu",
                },
                {
                  name: "Alex Jones",
                  role: "CONTACT",
                },
              ],
            },
          ],
        },
      },
    });

    expect(profiles).toHaveLength(2);
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("Clinical trial: Example Trial");
    expect(profiles[0].aliases).toContain("Role: PRINCIPAL_INVESTIGATOR");
    expect(profiles[1].contacts).toContainEqual({
      type: "email",
      value: "jane@example.edu",
      confidence: "Medium",
      sourceId: "clinicaltrials_gov_studies",
    });
    expect(profiles[1].locations?.[0]).toMatchObject({
      city: "Austin",
      state: "Texas",
      kind: "clinical trial site",
    });
  });

  it("skips studies without matching personnel names", () => {
    expect(
      mapClinicalTrialStudyToProfileInputs("Jane Smith", {
        protocolSection: {
          identificationModule: {
            nctId: "NCT00000002",
            briefTitle: "Example Trial",
          },
          contactsLocationsModule: {
            overallOfficials: [{ name: "Alex Jones", role: "STUDY_DIRECTOR" }],
          },
        },
      }),
    ).toEqual([]);
  });
});

