import { describe, expect, it } from "vitest";
import { mapStackExchangeUserToProfileInput } from "@/lib/sources/stack-exchange";

describe("Stack Exchange source mapping", () => {
  it("maps matching public Q&A profiles", () => {
    const profile = mapStackExchangeUserToProfileInput("Jane Smith", "stackoverflow", {
      user_id: 123,
      account_id: 456,
      display_name: "Jane Smith",
      location: "London",
      link: "https://stackoverflow.com/users/123/jane-smith",
      reputation: 789,
    });

    expect(profile?.id).toBe("p_stackexchange_stackoverflow_123");
    expect(profile?.fullName).toBe("Jane Smith");
    expect(profile?.aliases).toContain("Stack Exchange site: stackoverflow");
    expect(profile?.aliases).toContain("Reputation: 789");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "London",
      state: "User-entered",
      kind: "public Q&A profile",
    });
  });

  it("skips nonmatching display names", () => {
    expect(
      mapStackExchangeUserToProfileInput("Jane Smith", "stackoverflow", {
        user_id: 999,
        display_name: "Alex Jones",
      }),
    ).toBeNull();
  });
});

