import { describe, expect, it } from "vitest";
import {
  mapDojFaraRecordToProfileInput,
  type FaraProfileRecord,
} from "@/lib/sources/doj-fara";

describe("DOJ FARA registrant source mapping", () => {
  it("maps a short-form officer to a context profile", () => {
    const record: FaraProfileRecord = {
      registrationNumber: 7685,
      registrantName: "Venture Strategic Inc.",
      date: "2026-01-14T00:00:00",
      role: "short-form registrant officer",
    };

    const profile = mapDojFaraRecordToProfileInput(
      record,
      "Jeffrey Donald Corless",
    );

    expect(profile?.id).toBe("p_farareg_jeffrey_donald_corless");
    expect(profile?.fullName).toBe("Jeffrey Donald Corless");
    expect(profile?.aliases).toContain(
      "FARA registrant firm: Venture Strategic Inc.",
    );
    expect(profile?.aliases).toContain(
      "Role: short-form registrant officer",
    );
    expect(profile?.aliases).toContain("Filing year: 2026");
    expect(profile?.sourceRecord?.sourceId).toBe("doj_fara_registrants");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "7685__jeffrey_donald_corless",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Venture Strategic Inc.",
      state: "US",
      kind: "foreign-agent filing affiliation",
    });
  });

  it("maps an individual foreign-agent registrant", () => {
    const record: FaraProfileRecord = {
      registrationNumber: 7730,
      registrantName: "Fecso, Barbara Ann",
      date: "06/01/2026",
      role: "foreign agent registrant",
    };

    const profile = mapDojFaraRecordToProfileInput(record, "Barbara Ann Fecso");

    expect(profile?.id).toBe("p_farareg_barbara_ann_fecso");
    expect(profile?.fullName).toBe("Barbara Ann Fecso");
    expect(profile?.aliases).toContain(
      "FARA registrant firm: Fecso, Barbara Ann",
    );
    expect(profile?.aliases).toContain("Filing year: 2026");
  });

  it("skips individuals without any name", () => {
    expect(
      mapDojFaraRecordToProfileInput(
        { registrationNumber: 1, registrantName: "Example Firm" },
        "",
      ),
    ).toBeNull();
  });
});
