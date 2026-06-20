import { describe, expect, it } from "vitest";
import { mapFecContributionToProfileInput } from "@/lib/sources/fec-schedule-a";

describe("FEC Schedule A source mapping", () => {
  it("maps a contribution to a medium-confidence profile with address", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_first_name: "Bin",
      contributor_last_name: "Wang",
      contributor_street_1: "1052 S Delaware St",
      contributor_city: "San Mateo",
      contributor_state: "CA",
      contributor_zip: "94402",
      contributor_occupation: "Data Analyst",
      contributor_employer: "Tipping Point Community",
      contribution_receipt_date: "2024-10-31",
      contribution_receipt_amount: 5,
      committee: {
        committee_id: "C00401224",
        committee_name: "Blue to the Future 2024",
      },
    });

    expect(profile?.fullName).toBe("Bin Wang");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.locations?.[0]).toMatchObject({
      street: "1052 S Delaware St",
      city: "San Mateo",
      state: "CA",
      zip: "94402",
      kind: "campaign contribution address",
    });
    expect(profile?.aliases).toContain("Occupation: Data Analyst");
    expect(profile?.aliases).toContain(
      "Employer: Tipping Point Community",
    );
    expect(profile?.aliases).toContain(
      "Contributed to: Blue to the Future 2024",
    );
  });

  it("derives a stable record id from contributor name and address", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_first_name: "Bin",
      contributor_last_name: "Wang",
      contributor_street_1: "1052 S Delaware St",
      contributor_city: "San Mateo",
      contributor_state: "CA",
      contributor_zip: "94402",
    });

    expect(profile?.id).toBe("p_fec_ind_wang_bin_1052_s_delaware_st_san_mateo_ca_94402");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "wang_bin_1052_s_delaware_st_san_mateo_ca_94402",
    );
  });

  it("returns null when city or state is missing", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_first_name: "Bin",
      contributor_last_name: "Wang",
      contributor_city: "",
      contributor_state: "CA",
    });

    expect(profile).toBeNull();
  });

  it("falls back to the contributor_name field when first/last are blank", () => {
    const profile = mapFecContributionToProfileInput({
      contributor_name: "WANG, BIN",
      contributor_city: "San Jose",
      contributor_state: "CA",
      contributor_zip: "95110",
    });

    expect(profile?.fullName).toBe("Bin Wang");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "San Jose",
      state: "CA",
    });
  });
});
