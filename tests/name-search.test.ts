import { describe, expect, it } from "vitest";
import {
  getNameSearchTokens,
  isPersonLikeSearchName,
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

  it("supports first-name-only searches when no last name is given", () => {
    const tokens = getNameSearchTokens({
      mode: "name",
      firstName: "mai",
      lastName: "",
      city: "",
      state: "",
    });

    expect(tokens).toEqual(["mai"]);
    expect(normalizedNameMatchesTokens("mai ren", tokens)).toBe(true);
    expect(normalizedNameMatchesTokens("wenbo he", tokens)).toBe(false);
  });

  it("escapes SQL LIKE wildcard characters in token patterns", () => {
    expect(nameTokenLikePattern("a%b_c\\d")).toBe("% a\\%b\\_c\\\\d %");
  });

  it("rejects title-like catalog strings as display names", () => {
    const tokens = getNameSearchTokens({
      mode: "name",
      firstName: "Mai",
      lastName: "Ren",
      city: "",
      state: "",
    });

    expect(isPersonLikeSearchName("Mai Ren", tokens)).toBe(true);
    expect(
      isPersonLikeSearchName(
        '"Mai xiang zheng chang guo jia" guo zheng yan tao hui',
        tokens,
      ),
    ).toBe(false);
    expect(
      isPersonLikeSearchName("Bai, Shan Ren mai sheng yu neng li", tokens),
    ).toBe(false);
    expect(
      isPersonLikeSearchName("Cong ren kou da guo mai xiang ren li zi yuan", tokens),
    ).toBe(false);
  });
});
