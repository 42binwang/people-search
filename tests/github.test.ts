import { describe, expect, it } from "vitest";
import { mapGitHubUserToProfileInput } from "@/lib/sources/github";

describe("GitHub source mapping", () => {
  it("maps public GitHub users to developer context profiles", () => {
    const profile = mapGitHubUserToProfileInput("Jane Smith", {
      login: "janesmith",
      name: "Jane Smith",
      html_url: "https://github.com/janesmith",
      company: "Example Labs",
      blog: "https://example.dev",
      location: "Austin, TX",
      public_repos: 12,
      followers: 34,
    });

    expect(profile?.id).toBe("p_github_janesmith");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.confidence).toBe("Medium");
    expect(profile?.aliases).toContain("GitHub username: janesmith");
    expect(profile?.aliases).toContain("Company: Example Labs");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Austin, TX",
      state: "User-entered",
      kind: "public developer profile",
    });
  });

  it("skips nonmatching public names", () => {
    expect(
      mapGitHubUserToProfileInput("Jane Smith", {
        login: "alexjones",
        name: "Alex Jones",
      }),
    ).toBeNull();
  });

  it("captures a user-published public email as a low-confidence contact", () => {
    const profile = mapGitHubUserToProfileInput("Jane Smith", {
      login: "janesmith",
      name: "Jane Smith",
      email: "jane@example.dev",
    });

    expect(profile?.contacts).toEqual([
      {
        type: "email",
        value: "jane@example.dev",
        confidence: "Low",
        sourceId: "github_users",
      },
    ]);
  });

  it("omits contacts when the user has no public email", () => {
    const profile = mapGitHubUserToProfileInput("Jane Smith", {
      login: "janesmith",
      name: "Jane Smith",
      email: null,
    });

    expect(profile?.contacts).toEqual([]);
  });
});

