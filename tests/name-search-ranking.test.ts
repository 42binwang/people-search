import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDb,
  searchProfiles,
  upsertApprovedSource,
  upsertProfile,
} from "@/lib/db";

const sourceId = "test_name_ranking";
const profileIds = [
  "p_test_rank_substantive",
  "p_test_rank_bare",
  "p_test_rank_exact",
  "p_test_rank_partial",
  "p_test_rank_affil",
];

describe("name search ranking", () => {
  beforeEach(() => {
    cleanup();
    upsertApprovedSource({
      id: sourceId,
      name: sourceId,
      category: "Test source",
      jurisdiction: "Test",
      acquisitionMethod: "test",
    });

    // Substantive: has a real geographic location + an email contact.
    upsertProfile({
      id: "p_test_rank_substantive",
      fullName: "Alpha Rank",
      locations: [
        { street: "10 Real St", city: "Austin", state: "TX", sourceId },
      ],
      contacts: [{ type: "email", value: "alpha@example.test", sourceId }],
      sourceRecord: { sourceId, sourceRecordId: "sub", raw: {} },
    });

    // Bare: only a generic source-context location (arXiv, GLOBAL) and no
    // contact — a name-only match with no displayable substance.
    upsertProfile({
      id: "p_test_rank_bare",
      fullName: "Beta Rank",
      locations: [{ city: "arXiv", state: "GLOBAL", sourceId }],
      sourceRecord: { sourceId, sourceRecordId: "bare", raw: {} },
    });

    // Exact vs partial token match (both substantive).
    upsertProfile({
      id: "p_test_rank_exact",
      fullName: "Exact Rank",
      locations: [{ city: "Austin", state: "TX", sourceId }],
      sourceRecord: { sourceId, sourceRecordId: "exact", raw: {} },
    });
    upsertProfile({
      id: "p_test_rank_partial",
      fullName: "Exact Rank Jr",
      locations: [{ city: "Austin", state: "TX", sourceId }],
      sourceRecord: { sourceId, sourceRecordId: "partial", raw: {} },
    });

    // Carries an affiliated institution as a source note.
    upsertProfile({
      id: "p_test_rank_affil",
      fullName: "Gamma Rank",
      aliases: ["Institution: Test University"],
      locations: [{ city: "arXiv", state: "GLOBAL", sourceId }],
      sourceRecord: { sourceId, sourceRecordId: "affil", raw: {} },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("ranks a substantive result above a bare name-only match", () => {
    const ids = searchProfiles({
      mode: "name",
      firstName: "",
      lastName: "Rank",
      city: "",
      state: "",
    }).map((result) => result.id);

    expect(ids).toContain("p_test_rank_substantive");
    expect(ids).toContain("p_test_rank_bare");
    expect(ids.indexOf("p_test_rank_substantive")).toBeLessThan(
      ids.indexOf("p_test_rank_bare"),
    );
  });

  it("populates source categories on search results", () => {
    const [result] = searchProfiles({
      mode: "name",
      firstName: "",
      lastName: "Rank",
      city: "",
      state: "",
    });
    expect(result.sourceCategories).toEqual(["Test source"]);
  });

  it("ranks an exact name match above a partial token match", () => {
    const ids = searchProfiles({
      mode: "name",
      firstName: "Exact",
      lastName: "Rank",
      city: "",
      state: "",
    }).map((result) => result.id);

    expect(ids).toContain("p_test_rank_exact");
    expect(ids).toContain("p_test_rank_partial");
    expect(ids.indexOf("p_test_rank_exact")).toBeLessThan(
      ids.indexOf("p_test_rank_partial"),
    );
  });

  it("surfaces the affiliated institution on a search result", () => {
    const results = searchProfiles({
      mode: "name",
      firstName: "Gamma",
      lastName: "Rank",
      city: "",
      state: "",
    });
    const affil = results.find((result) => result.id === "p_test_rank_affil");
    expect(affil?.affiliation).toBe("Test University");
  });
});

function cleanup() {
  const db = getDb();
  const profilePlaceholders = profileIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM source_records WHERE source_id = ?`).run(sourceId);
  db.prepare(
    `DELETE FROM profile_aliases WHERE profile_id IN (${profilePlaceholders})`,
  ).run(...profileIds);
  db.prepare(
    `DELETE FROM profile_locations WHERE profile_id IN (${profilePlaceholders})`,
  ).run(...profileIds);
  db.prepare(
    `DELETE FROM profile_contacts WHERE profile_id IN (${profilePlaceholders})`,
  ).run(...profileIds);
  db.prepare(
    `DELETE FROM relationships WHERE profile_id IN (${profilePlaceholders})`,
  ).run(...profileIds);
  db.prepare(`DELETE FROM profiles WHERE id IN (${profilePlaceholders})`).run(
    ...profileIds,
  );
  db.prepare(`DELETE FROM approved_sources WHERE id = ?`).run(sourceId);
}
