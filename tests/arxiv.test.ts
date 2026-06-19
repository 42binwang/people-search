import { describe, expect, it } from "vitest";
import {
  mapArxivEntryToProfileInputs,
  parseArxivAtom,
} from "@/lib/sources/arxiv";

describe("arXiv source mapping", () => {
  it("parses Atom entries and maps matching authors", () => {
    const entries = parseArxivAtom(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/1234.5678v1</id>
          <title> A Useful
            Preprint </title>
          <published>2024-01-01T00:00:00Z</published>
          <author><name>Jane Smith</name></author>
          <author><name>Alex Jones</name></author>
        </entry>
      </feed>
    `);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "http://arxiv.org/abs/1234.5678v1",
      title: "A Useful Preprint",
      authors: ["Jane Smith", "Alex Jones"],
    });

    const profiles = mapArxivEntryToProfileInputs("Jane Smith", entries[0]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("arXiv preprint: A Useful Preprint");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "arXiv",
      state: "Global",
      kind: "preprint author metadata",
    });
  });

  it("skips entries without matching authors", () => {
    expect(
      mapArxivEntryToProfileInputs("Jane Smith", {
        id: "http://arxiv.org/abs/1234.5678v1",
        title: "A Useful Preprint",
        published: "2024-01-01T00:00:00Z",
        authors: ["Alex Jones"],
      }),
    ).toEqual([]);
  });
});

