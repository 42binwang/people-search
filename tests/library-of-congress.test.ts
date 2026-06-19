import { describe, expect, it } from "vitest";
import {
  mapLibraryOfCongressEntryToProfileInput,
  parseLibraryOfCongressSearch,
} from "@/lib/sources/library-of-congress";

describe("Library of Congress source mapping", () => {
  it("parses LOC JSON-feed entries and maps matching results", () => {
    const entries = parseLibraryOfCongressSearch([
      "atom:feed",
      {},
      [
        "atom:entry",
        {},
        ["atom:title", {}, "Smith, Jane, 1978-. Example work"],
        [
          "atom:link",
          {
            rel: "alternate",
            href: "http://id.loc.gov/resources/works/123",
          },
        ],
        ["atom:id", {}, "info:lc/resources/works/123"],
      ],
    ]);

    expect(entries).toEqual([
      {
        title: "Smith, Jane, 1978-. Example work",
        id: "info:lc/resources/works/123",
        href: "http://id.loc.gov/resources/works/123",
      },
    ]);

    const profile = mapLibraryOfCongressEntryToProfileInput("Jane Smith", entries[0]);
    expect(profile?.id).toBeDefined();
    expect(profile?.fullName).toBe("Smith, Jane, 1978-");
    expect(profile?.aliases).toContain(
      "Library of Congress result: Smith, Jane, 1978-. Example work",
    );
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Library of Congress",
      state: "US",
      kind: "authority or catalog metadata",
    });
  });

  it("skips nonmatching titles", () => {
    expect(
      mapLibraryOfCongressEntryToProfileInput("Jane Smith", {
        title: "Jones, Alex. Example work",
        id: "info:lc/resources/works/999",
      }),
    ).toBeNull();
  });
});

