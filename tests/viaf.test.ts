import { describe, expect, it } from "vitest";
import {
  mapViafRecordToProfileInput,
  parseViafRecords,
} from "@/lib/sources/viaf";

describe("VIAF source mapping", () => {
  it("parses collapsed VIAF search records and maps matching headings", () => {
    const records = parseViafRecords({
      searchRetrieveResponse: {
        records: {
          record: viafRecord("12345", "Twain, Mark, 1835-1910"),
        },
      },
    });

    expect(records).toHaveLength(1);

    const profile = mapViafRecordToProfileInput("Mark Twain", records[0]);
    expect(profile?.id).toBe("p_viaf_12345");
    expect(profile?.fullName).toBe("Twain, Mark, 1835-1910");
    expect(profile?.aliases).toContain("VIAF ID: 12345");
    expect(profile?.ageRange).toBe("Unknown");
    expect(profile?.aliases).toContain("Birth date metadata: 1835");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "VIAF",
      state: "Global",
      kind: "library authority metadata",
    });
  });

  it("skips nonmatching VIAF headings", () => {
    expect(
      mapViafRecordToProfileInput(
        "Jane Smith",
        viafRecord("999", "Jones, Alex, 1970-"),
      ),
    ).toBeNull();
  });
});

function viafRecord(viafId: string, heading: string) {
  return {
    recordData: {
      "ns2:VIAFCluster": {
        "ns2:viafID": viafId,
        "ns2:birthDate": "1835",
        "ns2:mainHeadings": {
          "ns2:data": {
            "ns2:text": heading,
          },
        },
      },
    },
  };
}
