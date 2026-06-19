import { describe, expect, it } from "vitest";
import {
  getNameSearchTokens,
  nameTokenLikePattern,
  normalizedNameMatchesTokens,
} from "@/lib/name-search";

describe("name search token matching", () => {
  it("uses exact normalized tokens for first and last name searches", () => {
    const tokens = getNameSearchTokens({
      mode: "name",
      firstName: "yuchen",
      lastName: "he",
      city: "",
      state: "",
    });

    expect(tokens).toEqual(["yuchen", "he"]);
    expect(normalizedNameMatchesTokens("yuchen he", tokens)).toBe(true);
    expect(normalizedNameMatchesTokens("chen li", tokens)).toBe(false);
    expect(normalizedNameMatchesTokens("avery chen", tokens)).toBe(false);
  });

  it("does not match short last names inside longer name tokens", () => {
    const tokens = getNameSearchTokens({
      mode: "name",
      firstName: "",
      lastName: "he",
      city: "",
      state: "",
    });

    expect(normalizedNameMatchesTokens("he", tokens)).toBe(true);
    expect(normalizedNameMatchesTokens("chen", tokens)).toBe(false);
    expect(normalizedNameMatchesTokens("cheng li", tokens)).toBe(false);
  });

  it("escapes SQL LIKE wildcard characters in token patterns", () => {
    expect(nameTokenLikePattern("a%b_c\\d")).toBe("% a\\%b\\_c\\\\d %");
  });
});
