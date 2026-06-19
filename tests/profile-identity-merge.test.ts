import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDb,
  getProfile,
  upsertApprovedSource,
  upsertProfile,
} from "@/lib/db";

const profileIds = [
  "p_test_merge_birth_a",
  "p_test_merge_birth_b",
  "p_test_merge_email_a",
  "p_test_merge_email_b",
  "p_test_merge_phone_a",
  "p_test_merge_phone_b",
  "p_test_merge_distinct_a",
  "p_test_merge_distinct_b",
];
const sourceIds = [
  "test_merge_birth_a",
  "test_merge_birth_b",
  "test_merge_email_a",
  "test_merge_email_b",
  "test_merge_phone_a",
  "test_merge_phone_b",
  "test_merge_distinct_a",
  "test_merge_distinct_b",
];

describe("profile identity merge", () => {
  beforeEach(() => {
    cleanup();
    for (const sourceId of sourceIds) {
      upsertApprovedSource({
        id: sourceId,
        name: sourceId,
        category: "Test source",
        jurisdiction: "Test",
        acquisitionMethod: "test",
      });
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("merges records with the same normalized name and exact birth date", () => {
    upsertProfile({
      id: "p_test_merge_birth_a",
      fullName: "Jane Q Smith",
      birthDate: "1980-04-05",
      locations: [
        { street: "1 First St", city: "San Francisco", state: "CA" },
      ],
      sourceRecord: {
        sourceId: "test_merge_birth_a",
        sourceRecordId: "a",
        raw: { record: "a" },
      },
    });

    upsertProfile({
      id: "p_test_merge_birth_b",
      fullName: "Jane Q. Smith",
      birthDate: "04/05/1980",
      locations: [{ street: "2 Second St", city: "Oakland", state: "CA" }],
      sourceRecord: {
        sourceId: "test_merge_birth_b",
        sourceRecordId: "b",
        raw: { record: "b" },
      },
    });

    const merged = getProfile("p_test_merge_birth_a");
    expect(merged?.addresses).toEqual([
      "1 First St, San Francisco, CA",
      "2 Second St, Oakland, CA",
    ]);
    expect(getProfile("p_test_merge_birth_b")).toBeNull();
    expect(getSourceRecordProfileId("test_merge_birth_b", "b")).toBe(
      "p_test_merge_birth_a",
    );
  });

  it("merges records with the same email", () => {
    upsertProfile({
      id: "p_test_merge_email_a",
      fullName: "Alex Rivera",
      contacts: [{ type: "email", value: "alex@example.com" }],
      sourceRecord: {
        sourceId: "test_merge_email_a",
        sourceRecordId: "a",
        raw: { record: "a" },
      },
    });

    upsertProfile({
      id: "p_test_merge_email_b",
      fullName: "A. Rivera",
      contacts: [{ type: "email", value: "Alex@Example.com" }],
      sourceRecord: {
        sourceId: "test_merge_email_b",
        sourceRecordId: "b",
        raw: { record: "b" },
      },
    });

    const merged = getProfile("p_test_merge_email_a");
    expect(merged?.emails).toEqual(["al***@example.com"]);
    expect(merged?.aliases).toContain("A. Rivera");
    expect(getProfile("p_test_merge_email_b")).toBeNull();
  });

  it("merges records with the same normalized phone", () => {
    upsertProfile({
      id: "p_test_merge_phone_a",
      fullName: "Riley Chen",
      contacts: [{ type: "phone", value: "(415) 555-0100" }],
      sourceRecord: {
        sourceId: "test_merge_phone_a",
        sourceRecordId: "a",
        raw: { record: "a" },
      },
    });

    upsertProfile({
      id: "p_test_merge_phone_b",
      fullName: "R Chen",
      contacts: [{ type: "phone", value: "4155550100" }],
      sourceRecord: {
        sourceId: "test_merge_phone_b",
        sourceRecordId: "b",
        raw: { record: "b" },
      },
    });

    const merged = getProfile("p_test_merge_phone_a");
    expect(merged?.phones).toEqual(["(415) 555-0100"]);
    expect(merged?.aliases).toContain("R Chen");
    expect(getProfile("p_test_merge_phone_b")).toBeNull();
  });

  it("does not merge same-name records with different birth dates", () => {
    upsertProfile({
      id: "p_test_merge_distinct_a",
      fullName: "Jordan Lee",
      birthDate: "1979-01-02",
    });

    upsertProfile({
      id: "p_test_merge_distinct_b",
      fullName: "Jordan Lee",
      birthDate: "1988-01-02",
    });

    expect(getProfile("p_test_merge_distinct_a")).not.toBeNull();
    expect(getProfile("p_test_merge_distinct_b")).not.toBeNull();
  });
});

function getSourceRecordProfileId(sourceId: string, sourceRecordId: string) {
  const row = getDb()
    .prepare(
      `
      SELECT profile_id AS profileId
      FROM source_records
      WHERE source_id = ? AND source_record_id = ?
    `,
    )
    .get(sourceId, sourceRecordId) as { profileId: string | null } | undefined;
  return row?.profileId ?? null;
}

function cleanup() {
  const db = getDb();
  const profilePlaceholders = profileIds.map(() => "?").join(",");
  const sourcePlaceholders = sourceIds.map(() => "?").join(",");

  db.prepare(
    `DELETE FROM source_records WHERE source_id IN (${sourcePlaceholders})`,
  ).run(...sourceIds);
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
  db.prepare(
    `DELETE FROM approved_sources WHERE id IN (${sourcePlaceholders})`,
  ).run(...sourceIds);
}
