import Database from "better-sqlite3";
import { join } from "path";

const dbPath = join(process.cwd(), "data", "people-search.sqlite");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericLocation(city: string, state: string): boolean {
  const genericCities = new Set([
    "federal register",
    "library of congress",
    "openalex",
    "wikidata",
    "crossref",
    "pubmed",
    "clinicaltrials gov",
    "internet archive",
    "open library",
    "github",
    "stack exchange",
    "orcid",
    "semantic scholar",
    "google books",
    "europe pmc",
    "socrata",
    "arcgis",
    "ckan",
    "opendatasoft",
    "musicbrainz",
    "viaf",
    "datacite",
    "arxiv",
  ]);
  const genericStates = new Set(["USER-ENTERED", "US"]);
  return genericCities.has(city) || genericStates.has(state);
}

interface ProfileRow {
  id: string;
  full_name: string;
  normalized_name: string;
  birth_date: string | null;
  normalized_birth_date: string | null;
}

interface LocationRow {
  profile_id: string;
  city: string;
  state: string;
}

function getProfilesToMerge(): Map<string, ProfileRow[]> {
  // Get all profiles with no birth date, grouped by normalized name
  const rows = db
    .prepare(
      `
      SELECT id, full_name, normalized_name, birth_date, normalized_birth_date
      FROM profiles
      WHERE suppressed_at IS NULL
        AND birth_date IS NULL
        AND normalized_birth_date IS NULL
      ORDER BY normalized_name, created_at, id
    `,
    )
    .all() as ProfileRow[];

  const grouped = new Map<string, ProfileRow[]>();
  for (const row of rows) {
    if (!grouped.has(row.normalized_name)) {
      grouped.set(row.normalized_name, []);
    }
    grouped.get(row.normalized_name)!.push(row);
  }

  // Only keep groups with multiple profiles
  for (const [name, profiles] of grouped) {
    if (profiles.length < 2) {
      grouped.delete(name);
    }
  }

  return grouped;
}

function hasContacts(profileId: string): boolean {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM profile_contacts WHERE profile_id = ?")
    .get(profileId) as { count: number };
  return row.count > 0;
}

function getLocations(profileId: string): LocationRow[] {
  return db
    .prepare(
      `
      SELECT profile_id, city, state
      FROM profile_locations
      WHERE profile_id = ?
    `,
    )
    .all(profileId) as LocationRow[];
}

function locationsOverlap(locations1: LocationRow[], locations2: LocationRow[]): boolean {
  const loc1Set = new Set(
    locations1.map((l) => `${normalizeText(l.city)},${l.state.trim().toUpperCase()}`)
  );
  const loc2Set = new Set(
    locations2.map((l) => `${normalizeText(l.city)},${l.state.trim().toUpperCase()}`)
  );

  for (const loc of loc1Set) {
    if (loc2Set.has(loc)) {
      return true;
    }
  }
  return false;
}

function hasGenericLocation(locations: LocationRow[]): boolean {
  return locations.some((l) =>
    isGenericLocation(normalizeText(l.city), l.state.trim().toUpperCase())
  );
}

function shouldMerge(profiles: ProfileRow[]): boolean {
  // Check if all profiles in the group have no contacts
  for (const profile of profiles) {
    if (hasContacts(profile.id)) {
      return false;
    }
  }

  // Get all locations for all profiles
  const allLocations = new Map<string, LocationRow[]>();
  for (const profile of profiles) {
    allLocations.set(profile.id, getLocations(profile.id));
  }

  // Check if any pair has overlapping locations OR generic locations
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const loc1 = allLocations.get(profiles[i].id)!;
      const loc2 = allLocations.get(profiles[j].id)!;

      if (locationsOverlap(loc1, loc2)) {
        return true;
      }

      if (hasGenericLocation(loc1) && hasGenericLocation(loc2)) {
        return true;
      }
    }
  }

  return false;
}

function mergeProfiles(profiles: ProfileRow[]): string {
  if (profiles.length < 2) {
    return "No merge needed";
  }

  // Sort by created_at to keep the oldest as the target
  const sortedProfiles = [...profiles].sort((a, b) => {
    const createdAtA =
      db
        .prepare("SELECT created_at FROM profiles WHERE id = ?")
        .get(a.id) as { created_at: string };
    const createdAtB =
      db
        .prepare("SELECT created_at FROM profiles WHERE id = ?")
        .get(b.id) as { created_at: string };
    return createdAtA.created_at.localeCompare(createdAtB.created_at) || a.id.localeCompare(b.id);
  });

  const targetId = sortedProfiles[0].id;
  const sourceIds = sortedProfiles.slice(1).map((p) => p.id);

  console.log(`  Merging ${sourceIds.length} profiles into ${targetId}`);

  const tx = db.transaction(() => {
    for (const sourceId of sourceIds) {
      // Update profile_aliases
      db
        .prepare("UPDATE profile_aliases SET profile_id = ? WHERE profile_id = ?")
        .run(targetId, sourceId);

      // Update profile_locations
      db
        .prepare("UPDATE profile_locations SET profile_id = ? WHERE profile_id = ?")
        .run(targetId, sourceId);

      // Update profile_contacts
      db
        .prepare("UPDATE profile_contacts SET profile_id = ? WHERE profile_id = ?")
        .run(targetId, sourceId);

      // Update relationships
      db
        .prepare("UPDATE relationships SET profile_id = ? WHERE profile_id = ?")
        .run(targetId, sourceId);

      // Update source_records
      db
        .prepare("UPDATE source_records SET profile_id = ? WHERE profile_id = ?")
        .run(targetId, sourceId);

      // Update record_feedback
      db
        .prepare("UPDATE record_feedback SET profile_id = ? WHERE profile_id = ?")
        .run(targetId, sourceId);

      // Delete the old profile
      db.prepare("DELETE FROM profiles WHERE id = ?").run(sourceId);
    }
  });

  tx();
  return `Merged ${sourceIds.length} profiles into ${targetId}`;
}

function main() {
  console.log("Finding profiles to merge...");
  const groupedProfiles = getProfilesToMerge();

  console.log(`Found ${groupedProfiles.size} name groups with multiple profiles`);

  let mergedCount = 0;
  let skippedCount = 0;

  for (const [name, profiles] of groupedProfiles) {
    if (shouldMerge(profiles)) {
      console.log(`\nMerging "${name}" (${profiles.length} profiles)`);
      mergeProfiles(profiles);
      mergedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n\nSummary:`);
  console.log(`  Merged ${mergedCount} name groups`);
  console.log(`  Skipped ${skippedCount} name groups (contacts or no location overlap)`);

  db.close();
}

main();
