import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDb,
  searchProfiles,
  upsertApprovedSource,
  upsertProfile,
} from "@/lib/db";

const sourceId = "test_address_search";

const profileIds = [
  "p_test_addr_main",
  "p_test_addr_oak",
  "p_test_addr_pine_exact",
  "p_test_addr_pine_partial",
  "p_test_addr_arxiv_context",
  "p_test_addr_user_entered",
  "p_test_addr_random_way",
];

describe("address search (fuzzy / partial)", () => {
  beforeEach(() => {
    cleanup();
    upsertApprovedSource({
      id: sourceId,
      name: sourceId,
      category: "Test source",
      jurisdiction: "Test",
      acquisitionMethod: "test",
    });

    upsertProfile({
      id: "p_test_addr_main",
      fullName: "Main Resident",
      locations: [
        {
          street: "123 Main Street",
          city: "San Mateo",
          state: "CA",
          zip: "94401",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "main", raw: {} },
    });

    upsertProfile({
      id: "p_test_addr_oak",
      fullName: "Oak Resident",
      locations: [
        {
          street: "456 Oak Avenue",
          city: "Austin",
          state: "TX",
          zip: "78701",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "oak", raw: {} },
    });

    upsertProfile({
      id: "p_test_addr_pine_exact",
      fullName: "Pine Exact",
      locations: [
        {
          street: "789 Pine Road",
          city: "Denver",
          state: "CO",
          zip: "80202",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "pine-exact", raw: {} },
    });

    upsertProfile({
      id: "p_test_addr_pine_partial",
      fullName: "Pine Partial",
      locations: [
        {
          street: "789 Pine Court",
          city: "Denver",
          state: "CO",
          zip: "80203",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "pine-partial", raw: {} },
    });

    // Source-context only — must never surface as a residential address match.
    upsertProfile({
      id: "p_test_addr_arxiv_context",
      fullName: "Preprint Author",
      locations: [
        {
          street: "1 Source Metadata Way",
          city: "arXiv",
          state: "GLOBAL",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "arxiv", raw: {} },
    });

    // Self-reported (GitHub-style) location — excluded by the generic-state filter.
    upsertProfile({
      id: "p_test_addr_user_entered",
      fullName: "Developer Profile",
      locations: [
        {
          street: "999 Profile Boulevard",
          city: "Austin, TX",
          state: "USER-ENTERED",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "user-entered", raw: {} },
    });

    // Shares only the "Way" suffix with the Vesca query below — must NOT match.
    upsertProfile({
      id: "p_test_addr_random_way",
      fullName: "Random Way Resident",
      locations: [
        {
          street: "999 Random Way",
          city: "Denver",
          state: "CO",
          sourceId,
        },
      ],
      sourceRecord: { sourceId, sourceRecordId: "random-way", raw: {} },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("matches a street-only query with no state provided", () => {
    const results = searchProfiles({
      mode: "address",
      street: "123 main st",
      city: "",
      state: "",
      zip: "",
    });

    expect(results.map((result) => result.id)).toContain("p_test_addr_main");
  });

  it("matches a street + city query with no state provided", () => {
    const results = searchProfiles({
      mode: "address",
      street: "456 oak ave",
      city: "Austin",
      state: "",
      zip: "",
    });

    expect(results.map((result) => result.id)).toContain("p_test_addr_oak");
  });

  it("matches a ZIP-only query", () => {
    const results = searchProfiles({
      mode: "address",
      street: "",
      city: "",
      state: "",
      zip: "94401",
    });

    expect(results.map((result) => result.id)).toContain("p_test_addr_main");
  });

  it("matches street-suffix variants (rd<->Road) but not unrelated street names", () => {
    // "rd" matches stored "Road" via suffix variants; "Court" must not match "rd".
    const results = searchProfiles({
      mode: "address",
      street: "789 pine rd",
      city: "",
      state: "CO",
      zip: "",
    });
    const ids = results.map((result) => result.id);

    expect(ids).toContain("p_test_addr_pine_exact");
    expect(ids).not.toContain("p_test_addr_pine_partial");
  });

  it("does not return unrelated addresses that share only a common suffix token", () => {
    // Regression: token-OR matched any address containing "Way"; all-tokens-AND
    // must require the full street (number + name + suffix), so a query for an
    // unrelated address returns nothing rather than every "... Way" record.
    const results = searchProfiles({
      mode: "address",
      street: "4824 Vesca Way",
      city: "",
      state: "",
      zip: "",
    });
    const ids = results.map((result) => result.id);

    expect(ids).not.toContain("p_test_addr_random_way");
    expect(ids).not.toContain("p_test_addr_main");
  });

  it("excludes source-context (generic city/state) locations", () => {
    const byStreet = searchProfiles({
      mode: "address",
      street: "source metadata",
      city: "",
      state: "",
      zip: "",
    });
    const byUserEntered = searchProfiles({
      mode: "address",
      street: "999 profile blvd",
      city: "",
      state: "",
      zip: "",
    });

    expect(byStreet.map((result) => result.id)).not.toContain(
      "p_test_addr_arxiv_context",
    );
    expect(byUserEntered.map((result) => result.id)).not.toContain(
      "p_test_addr_user_entered",
    );
  });
});

function cleanup() {
  const db = getDb();
  const profilePlaceholders = profileIds.map(() => "?").join(",");

  db.prepare(
    `DELETE FROM source_records WHERE source_id = ?`,
  ).run(sourceId);
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
