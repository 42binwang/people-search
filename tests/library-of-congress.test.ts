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
            href: "http://id.loc.gov/authorities/names/n123456",
          },
        ],
        ["atom:id", {}, "http://id.loc.gov/authorities/names/n123456"],
      ],
    ]);

    expect(entries).toEqual([
      {
        title: "Smith, Jane, 1978-. Example work",
        id: "http://id.loc.gov/authorities/names/n123456",
        href: "http://id.loc.gov/authorities/names/n123456",
      },
    ]);

    const profile = mapLibraryOfCongressEntryToProfileInput("Jane Smith", entries[0]);
    expect(profile?.id).toBeDefined();
    expect(profile?.fullName).toBe("Jane Smith");
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
        id: "http://id.loc.gov/authorities/names/n999999",
      }),
    ).toBeNull();
  });

  it("skips matching catalog work titles instead of treating them as names", () => {
    expect(
      mapLibraryOfCongressEntryToProfileInput("Mai Ren", {
        title:
          '"Mai xiang zheng chang guo jia" guo zheng yan tao hui (2002 : Gong wu ren li fa zhan zhong xin)',
        id: "info:lc/resources/works/123",
        href: "http://id.loc.gov/resources/works/123",
      }),
    ).toBeNull();
  });

  it("skips long title-like authority headings", () => {
    expect(
      mapLibraryOfCongressEntryToProfileInput("Mai Ren", {
        title: "Bai, Shan Ren mai sheng yu neng li 人脉胜于能力 Beijing Shi",
        id: "http://id.loc.gov/authorities/names/n888888",
        href: "http://id.loc.gov/authorities/names/n888888",
      }),
    ).toBeNull();
  });
});
