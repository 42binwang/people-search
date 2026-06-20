import { describe, expect, it } from "vitest";
import { mapNihProjectToProfileInputs } from "@/lib/sources/nih-reporter";

const project = {
  appl_id: "9085351",
  project_num: "4R01HL116525-04",
  project_title: "SHP2 controls cardiac stress adaptation",
  fiscal_year: "2016",
  award_amount: "365025",
  agency_code: "NIH",
  organization: {
    org_name: "University of Missouri-Columbia",
    org_city: "Columbia",
    org_state: "MO",
  },
  principal_investigators: [
    {
      first_name: "Maike",
      last_name: "Krenz",
      full_name: "Maike  Krenz",
      is_contact_pi: true,
    },
    {
      first_name: "Alex",
      last_name: "Rivera",
      full_name: "Alex Rivera",
      is_contact_pi: false,
    },
  ],
};

describe("NIH RePORTER source mapping", () => {
  it("maps a matching principal investigator to a research-grant context profile", () => {
    const profiles = mapNihProjectToProfileInputs("Maike Krenz", project);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Maike Krenz");
    expect(profiles[0].id).toBe(
      "p_nih_reporter_maike_krenz_9085351_0",
    );
    expect(profiles[0].aliases).toContain(
      "NIH project: SHP2 controls cardiac stress adaptation",
    );
    expect(profiles[0].aliases).toContain("Project number: 4R01HL116525-04");
    expect(profiles[0].aliases).toContain("Fiscal year: 2016");
    expect(profiles[0].aliases).toContain("Award amount: $365,025");
    expect(profiles[0].aliases).toContain(
      "Institution: University of Missouri-Columbia, Columbia, MO",
    );
    // Vanity metrics are never emitted as source notes.
    expect(profiles[0]?.aliases?.some((a) => /cited by/i.test(a))).toBe(false);
    // Institution is a source note, not a residential location.
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "NIH RePORTER",
      state: "Global",
      kind: "federal research grant affiliation",
    });
    expect(profiles[0].contacts).toEqual([]);
  });

  it("skips investigators that do not match the query", () => {
    const profiles = mapNihProjectToProfileInputs("Maike Krenz", project);
    expect(profiles.every((p) => !p.fullName.includes("Rivera"))).toBe(true);
  });

  it("returns nothing when no investigator matches the query", () => {
    expect(mapNihProjectToProfileInputs("Nobody Match", project)).toEqual([]);
  });

  it("returns nothing for projects without an application id", () => {
    expect(
      mapNihProjectToProfileInputs("Maike Krenz", { ...project, appl_id: undefined }),
    ).toEqual([]);
  });
});
