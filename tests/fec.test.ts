import { describe, expect, it } from "vitest";
import { mapFecCandidateToProfileInput } from "@/lib/sources/fec";

describe("FEC source mapping", () => {
  it("maps candidates to civic context profiles", () => {
    const profile = mapFecCandidateToProfileInput({
      candidate_id: "H4TX00001",
      name: "SMITH, JANE Q",
      state: "TX",
      office_full: "House",
      party_full: "DEMOCRATIC PARTY",
      active_through: 2024,
    });

    expect(profile?.id).toBe("p_fec_H4TX00001");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.aliases).toContain("Party: DEMOCRATIC PARTY");
    expect(profile?.aliases).toContain("Office: House");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "House",
      state: "TX",
      kind: "candidate jurisdiction",
    });
  });

  it("skips malformed candidates", () => {
    expect(
      mapFecCandidateToProfileInput({
        candidate_id: "",
        name: "SMITH, JANE",
      }),
    ).toBeNull();
  });
});

