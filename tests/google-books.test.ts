import { describe, expect, it } from "vitest";
import { mapGoogleBooksVolumeToProfileInputs } from "@/lib/sources/google-books";

describe("Google Books source mapping", () => {
  it("maps matching volume authors to catalog context profiles", () => {
    const profiles = mapGoogleBooksVolumeToProfileInputs("Jane Smith", {
      id: "volume-1",
      volumeInfo: {
        title: "Example Book",
        authors: ["Jane Smith", "Alex Jones"],
        publisher: "Example Press",
        publishedDate: "2024",
        infoLink: "https://books.google.com/books?id=volume-1",
        categories: ["Biography", "Education"],
      },
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].fullName).toBe("Jane Smith");
    expect(profiles[0].aliases).toContain("Book/catalog result: Example Book");
    expect(profiles[0].aliases).toContain("Publisher: Example Press");
    expect(profiles[0].locations?.[0]).toMatchObject({
      city: "Google Books",
      state: "Global",
      kind: "book/catalog author metadata",
    });
  });

  it("skips nonmatching authors", () => {
    expect(
      mapGoogleBooksVolumeToProfileInputs("Jane Smith", {
        id: "volume-2",
        volumeInfo: {
          title: "Other Book",
          authors: ["Alex Jones"],
        },
      }),
    ).toEqual([]);
  });
});
