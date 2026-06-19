import { describe, expect, it } from "vitest";
import { mapMusicBrainzArtistToProfileInput } from "@/lib/sources/musicbrainz";

describe("MusicBrainz source mapping", () => {
  it("maps matching person artists to music metadata profiles", () => {
    const profile = mapMusicBrainzArtistToProfileInput("Taylor Swift", {
      id: "20244d07-534f-4eff-b4d4-930878889970",
      name: "Taylor Swift",
      "sort-name": "Swift, Taylor",
      type: "Person",
      country: "US",
      "begin-area": {
        name: "West Reading",
      },
      "life-span": {
        begin: "1989-12-13",
        ended: false,
      },
      isnis: ["0000000078519858"],
    });

    expect(profile?.id).toBe(
      "p_musicbrainz_20244d07_534f_4eff_b4d4_930878889970",
    );
    expect(profile?.fullName).toBe("Taylor Swift");
    expect(profile?.ageRange).toBe("Born 1989-12-13");
    expect(profile?.aliases).toContain(
      "MusicBrainz artist ID: 20244d07-534f-4eff-b4d4-930878889970",
    );
    expect(profile?.aliases).toContain("ISNI: 0000000078519858");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "West Reading",
      state: "US",
      kind: "music artist metadata",
    });
  });

  it("skips nonmatching artists", () => {
    expect(
      mapMusicBrainzArtistToProfileInput("Taylor Swift", {
        id: "artist-2",
        name: "Alex Jones",
      }),
    ).toBeNull();
  });
});
