import { describe, expect, it } from "vitest";
import { mapWikidataEntityToProfileInput } from "@/lib/sources/wikidata";

describe("Wikidata source mapping", () => {
  it("maps entity search hits to public-knowledge context profiles", () => {
    const profile = mapWikidataEntityToProfileInput({
      id: "Q12345",
      label: "Jane Smith",
      description: "fictional <span>example</span> person",
      concepturi: "http://www.wikidata.org/entity/Q12345",
    });

    expect(profile?.id).toBe("p_wikidata_Q12345");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.confidence).toBe("Low");
    expect(profile?.aliases).toContain("Description: fictional example person");
    expect(profile?.aliases).toContain(
      "Wikidata entity: http://www.wikidata.org/entity/Q12345",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Wikidata",
      state: "Global",
      kind: "public knowledge entity",
    });
  });

  it("skips entities without an id or label", () => {
    expect(
      mapWikidataEntityToProfileInput({
        id: "",
        label: "Jane Smith",
      }),
    ).toBeNull();
  });
});

