import { describe, expect, it } from "vitest";
import {
  dedupeCitationCounts,
  isHiddenSourceAlias,
  isSourceNoteAlias,
  orderSourceNotes,
  organizePublicSummaryAliases,
} from "@/lib/profile-summary";

describe("organizePublicSummaryAliases", () => {
  it("keeps concise person-level facts and drops match artifacts", () => {
    const { notes } = organizePublicSummaryAliases([
      "arXiv preprint: Location Cheating: A Security Challenge to Location-based Social Network Services",
      "Cited by count: 122",
      "Citation count: 122",
      "Last known institution: University of Nebraska–Lincoln",
      "GitHub username: mairen",
      "h-index: 1",
      "Federal Register mention: Certain Pillows and Seat Cushions; Notice of Institution of Investigation",
      "Publication date: 2022-08-12",
      "Agency: International Trade Commission",
    ]);

    // Useful scalar facts are retained...
    expect(notes).toContain("Last known institution: University of Nebraska–Lincoln");
    expect(notes).toContain("h-index: 1");
    expect(notes).toContain("GitHub username: mairen");
    // ...while verbose records / keyword matches are dropped (they are rendered
    // as structured lists, or omitted, via lib/profile-source-records).
    expect(notes).not.toContain(
      "Federal Register mention: Certain Pillows and Seat Cushions; Notice of Institution of Investigation",
    );
    expect(notes).not.toContain("Publication date: 2022-08-12");
    expect(notes).not.toContain("Agency: International Trade Commission");
    expect(
      notes,
    ).not.toContain(
      "arXiv preprint: Location Cheating: A Security Challenge to Location-based Social Network Services",
    );
  });

  it("collapses duplicate citation totals from OpenAlex and Semantic Scholar", () => {
    const { notes } = organizePublicSummaryAliases([
      "Cited by count: 122",
      "Citation count: 122",
    ]);

    expect(notes).toEqual(["Citation count: 122"]);
  });

  it("keeps both citation notes when the numbers disagree", () => {
    const { notes } = organizePublicSummaryAliases([
      "Cited by count: 122",
      "Citation count: 130",
    ]);

    expect(notes).toContain("Cited by count: 122");
    expect(notes).toContain("Citation count: 130");
    expect(notes).toHaveLength(2);
  });

  it("never exposes hidden raw-identifier aliases", () => {
    const { notes, names } = organizePublicSummaryAliases([
      "LOC ID: info:lc/resources/works/16248647",
      "Library of Congress result: Mai, Jia, 1964-. Ren jian xin",
      "DOI: 10.1109/icdcs.2011.42",
      "arXiv entry: http://arxiv.org/abs/1102.4135v1",
      "h-index: 1",
    ]);

    expect(notes).toEqual(["h-index: 1"]);
    expect(names).toEqual([]);
  });

  it("drops work titles from the summary (rendered as structured records)", () => {
    const { notes } = organizePublicSummaryAliases([
      "arXiv preprint: Location Cheating: A Security Challenge",
      "Year: 2011",
    ]);

    expect(notes).toEqual(["Year: 2011"]);
  });

  it("collects readable person names separately from notes", () => {
    const { names, notes } = organizePublicSummaryAliases([
      "Mai Ren",
      "Ren, Mai",
      "h-index: 1",
      "https://example.com/some-long-url-that-is-not-a-name",
    ]);

    expect(names).toEqual(["Mai Ren", "Ren, Mai"]);
    expect(notes).toEqual(["h-index: 1"]);
  });

  it("shortens the GitHub profile URL into a readable note", () => {
    const { notes } = organizePublicSummaryAliases([
      "GitHub profile: https://github.com/mairen",
    ]);

    expect(notes).toEqual(["GitHub profile available"]);
  });

  it("counts the cleaned GitHub profile note as a useful default fact", () => {
    const result = organizePublicSummaryAliases([
      "GitHub profile: https://github.com/mairen",
      "Federal Register mention: unrelated noise",
    ]);

    expect(result.noteDefaultLimit).toBe(1);
    expect(result.notes[0]).toBe("GitHub profile available");
  });

  it("returns only useful notes, so the default limit equals the count", () => {
    const result = organizePublicSummaryAliases([
      "h-index: 1",
      "Year: 2011",
      "Federal Register mention: some unrelated notice",
      "Publication date: 2022-08-12",
    ]);

    expect(result.notes).toEqual(["h-index: 1", "Year: 2011"]);
    expect(result.noteDefaultLimit).toBe(2);
  });

  it("returns no notes when only noisy notes exist", () => {
    const result = organizePublicSummaryAliases([
      "Federal Register mention: only noise here",
    ]);

    expect(result.noteDefaultLimit).toBe(0);
    expect(result.notes).toEqual([]);
  });
});

describe("orderSourceNotes", () => {
  it("is stable within each group", () => {
    const ordered = orderSourceNotes([
      "Federal Register mention: noise one",
      "h-index: 1",
      "Paper count: 1",
      "Publication date: 2022-08-12",
    ]);

    expect(ordered).toEqual([
      "h-index: 1",
      "Paper count: 1",
      "Federal Register mention: noise one",
      "Publication date: 2022-08-12",
    ]);
  });
});

describe("dedupeCitationCounts", () => {
  it("drops Cited by count when Citation count matches", () => {
    expect(
      dedupeCitationCounts(["Cited by count: 5", "Citation count: 5"]),
    ).toEqual(["Citation count: 5"]);
  });

  it("leaves unrelated notes untouched", () => {
    expect(dedupeCitationCounts(["h-index: 1", "Year: 2011"])).toEqual([
      "h-index: 1",
      "Year: 2011",
    ]);
  });
});

describe("source note classification guards", () => {
  it("treats hidden prefixes as hidden", () => {
    expect(isHiddenSourceAlias("DOI: 10.1/abc")).toBe(true);
    expect(isHiddenSourceAlias("Library of Congress result: x")).toBe(true);
    expect(isHiddenSourceAlias("h-index: 1")).toBe(false);
  });

  it("treats known labels as source notes", () => {
    expect(isSourceNoteAlias("h-index: 1")).toBe(true);
    expect(isSourceNoteAlias("Federal Register mention: x")).toBe(true);
    expect(isSourceNoteAlias("Mai Ren")).toBe(false);
  });
});
