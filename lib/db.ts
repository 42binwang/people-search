import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import {
  maskEmail,
  normalizeAddress,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeText,
} from "@/lib/normalization";
import type { SearchPayload } from "@/lib/search-store";

const dbPath = join(process.cwd(), "data", "people-search.sqlite");

export type SearchResult = {
  id: string;
  name: string;
  ageRange: string;
  locations: string[];
  relatives: string[];
  confidence: string;
};

export type Profile = SearchResult & {
  aliases: string[];
  phones: string[];
  emails: string[];
  addresses: string[];
  sourceCategories: string[];
};

export type PrivacyRequest = {
  id: number;
  type: string;
  status: string;
  profileId: string | null;
  requesterName: string;
  requesterEmail: string;
  details: string;
  createdAt: string;
  reviewedAt: string | null;
};

declare global {
  var peopleSearchDb: Database.Database | undefined;
}

export function getDb() {
  if (!globalThis.peopleSearchDb) {
    mkdirSync(dirname(dbPath), { recursive: true });
    globalThis.peopleSearchDb = new Database(dbPath);
    globalThis.peopleSearchDb.pragma("journal_mode = WAL");
    globalThis.peopleSearchDb.pragma("foreign_keys = ON");
    migrate(globalThis.peopleSearchDb);
  }
  return globalThis.peopleSearchDb;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS approved_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      acquisition_method TEXT NOT NULL,
      license_url TEXT,
      approved_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      age_range TEXT NOT NULL DEFAULT 'Unknown',
      confidence TEXT NOT NULL DEFAULT 'Medium',
      suppressed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profile_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      street TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT,
      normalized_address TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'possible',
      source_id TEXT REFERENCES approved_sources(id),
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('phone', 'email')),
      value TEXT NOT NULL,
      display_value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'Medium',
      source_id TEXT REFERENCES approved_sources(id),
      display_allowed INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      related_name TEXT NOT NULL,
      relationship_type TEXT NOT NULL DEFAULT 'possible associate',
      confidence TEXT NOT NULL DEFAULT 'Medium',
      source_id TEXT REFERENCES approved_sources(id)
    );

    CREATE TABLE IF NOT EXISTS source_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL REFERENCES approved_sources(id),
      source_record_id TEXT NOT NULL,
      profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      raw_json TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, source_record_id)
    );

    CREATE TABLE IF NOT EXISTS suppression_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS privacy_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      profile_id TEXT,
      requester_name TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      review_note TEXT
    );

    CREATE TABLE IF NOT EXISTS abuse_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_normalized_name ON profiles(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_profiles_suppressed ON profiles(suppressed_at);
    CREATE INDEX IF NOT EXISTS idx_locations_address ON profile_locations(normalized_address);
    CREATE INDEX IF NOT EXISTS idx_locations_city_state ON profile_locations(city, state);
    CREATE INDEX IF NOT EXISTS idx_contacts_normalized ON profile_contacts(type, normalized_value);
    CREATE INDEX IF NOT EXISTS idx_privacy_status ON privacy_requests(status, created_at);
  `);
}

export function databaseHasProfiles() {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM profiles").get() as {
    count: number;
  };
  return row.count > 0;
}

export function searchProfiles(payload: SearchPayload): SearchResult[] {
  const db = getDb();

  if (payload.mode === "name") {
    const nameQuery = normalizeName(
      [payload.firstName, payload.lastName].filter(Boolean).join(" "),
    );
    const lastName = normalizeName(payload.lastName);
    const city = normalizeText(payload.city);
    const state = payload.state.trim().toUpperCase();
    const rows = db
      .prepare(
        `
        SELECT DISTINCT p.*
        FROM profiles p
        LEFT JOIN profile_aliases a ON a.profile_id = p.id
        LEFT JOIN profile_locations l ON l.profile_id = p.id
        WHERE p.suppressed_at IS NULL
          AND (
            p.normalized_name LIKE @nameLike
            OR p.normalized_name LIKE @lastLike
            OR a.normalized_alias LIKE @nameLike
          )
          AND (@state = '' OR l.state = @state)
          AND (@city = '' OR lower(l.city) LIKE @cityLike)
        ORDER BY
          CASE p.confidence WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
          p.full_name
        LIMIT 25
      `,
      )
      .all({
        nameLike: `%${nameQuery || lastName}%`,
        lastLike: `%${lastName}%`,
        state,
        city,
        cityLike: `%${city}%`,
      }) as DbProfileRow[];

    return rows.map(toSearchResult);
  }

  if (payload.mode === "phone") {
    const phone = normalizePhone(payload.phone);
    const rows = db
      .prepare(
        `
        SELECT DISTINCT p.*
        FROM profiles p
        JOIN profile_contacts c ON c.profile_id = p.id
        WHERE p.suppressed_at IS NULL
          AND c.type = 'phone'
          AND c.normalized_value = @phone
        LIMIT 25
      `,
      )
      .all({ phone }) as DbProfileRow[];

    return rows.map(toSearchResult);
  }

  const normalizedAddress = normalizeAddress(payload);
  const rows = db
    .prepare(
      `
      SELECT DISTINCT p.*
      FROM profiles p
      JOIN profile_locations l ON l.profile_id = p.id
      WHERE p.suppressed_at IS NULL
        AND l.normalized_address LIKE @addressLike
        AND l.state = @state
      LIMIT 25
    `,
    )
    .all({
      addressLike: `%${normalizedAddress}%`,
      state: payload.state.trim().toUpperCase(),
    }) as DbProfileRow[];

  return rows.map(toSearchResult);
}

export function getProfile(id: string): Profile | null {
  const row = getDb()
    .prepare("SELECT * FROM profiles WHERE id = ? AND suppressed_at IS NULL")
    .get(id) as DbProfileRow | undefined;

  if (!row) {
    return null;
  }

  return {
    ...toSearchResult(row),
    aliases: getAliases(row.id),
    phones: getContacts(row.id, "phone"),
    emails: getContacts(row.id, "email"),
    addresses: getAddressHistory(row.id),
    sourceCategories: getSourceCategories(row.id),
  };
}

export function upsertApprovedSource(source: {
  id: string;
  name: string;
  category: string;
  jurisdiction: string;
  acquisitionMethod: string;
  licenseUrl?: string;
  notes?: string;
}) {
  getDb()
    .prepare(
      `
      INSERT INTO approved_sources (
        id, name, category, jurisdiction, acquisition_method, license_url, approved_at, notes
      )
      VALUES (@id, @name, @category, @jurisdiction, @acquisitionMethod, @licenseUrl, CURRENT_TIMESTAMP, @notes)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        jurisdiction = excluded.jurisdiction,
        acquisition_method = excluded.acquisition_method,
        license_url = excluded.license_url,
        notes = excluded.notes
    `,
    )
    .run({
      ...source,
      licenseUrl: source.licenseUrl ?? null,
      notes: source.notes ?? null,
    });
}

export function upsertProfile(input: {
  id: string;
  fullName: string;
  ageRange?: string;
  confidence?: string;
  aliases?: string[];
  locations?: Array<{
    street?: string;
    city: string;
    state: string;
    zip?: string;
    kind?: string;
    sourceId?: string;
  }>;
  contacts?: Array<{
    type: "phone" | "email";
    value: string;
    confidence?: string;
    sourceId?: string;
  }>;
  relationships?: Array<{
    name: string;
    type?: string;
    confidence?: string;
    sourceId?: string;
  }>;
  sourceRecord?: {
    sourceId: string;
    sourceRecordId: string;
    raw: unknown;
  };
}) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO profiles (id, full_name, normalized_name, age_range, confidence, updated_at)
      VALUES (@id, @fullName, @normalizedName, @ageRange, @confidence, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        normalized_name = excluded.normalized_name,
        age_range = excluded.age_range,
        confidence = excluded.confidence,
        updated_at = CURRENT_TIMESTAMP
    `,
    ).run({
      id: input.id,
      fullName: input.fullName,
      normalizedName: normalizeName(input.fullName),
      ageRange: input.ageRange ?? "Unknown",
      confidence: input.confidence ?? "Medium",
    });

    db.prepare("DELETE FROM profile_aliases WHERE profile_id = ?").run(input.id);
    for (const alias of input.aliases ?? []) {
      db.prepare(
        "INSERT INTO profile_aliases (profile_id, alias, normalized_alias) VALUES (?, ?, ?)",
      ).run(input.id, alias, normalizeName(alias));
    }

    db.prepare("DELETE FROM profile_locations WHERE profile_id = ?").run(input.id);
    for (const [index, location] of (input.locations ?? []).entries()) {
      db.prepare(
        `
        INSERT INTO profile_locations (
          profile_id, street, city, state, zip, normalized_address, kind, source_id, display_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        input.id,
        location.street ?? null,
        location.city,
        location.state.trim().toUpperCase(),
        location.zip ?? null,
        normalizeAddress(location),
        location.kind ?? "possible",
        location.sourceId ?? null,
        index,
      );
    }

    db.prepare("DELETE FROM profile_contacts WHERE profile_id = ?").run(input.id);
    for (const contact of input.contacts ?? []) {
      const normalized =
        contact.type === "phone"
          ? normalizePhone(contact.value)
          : normalizeEmail(contact.value);
      if (!normalized) {
        continue;
      }

      db.prepare(
        `
        INSERT INTO profile_contacts (
          profile_id, type, value, display_value, normalized_value, confidence, source_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        input.id,
        contact.type,
        contact.value,
        contact.type === "email" ? maskEmail(contact.value) : contact.value,
        normalized,
        contact.confidence ?? "Medium",
        contact.sourceId ?? null,
      );
    }

    db.prepare("DELETE FROM relationships WHERE profile_id = ?").run(input.id);
    for (const relationship of input.relationships ?? []) {
      db.prepare(
        `
        INSERT INTO relationships (
          profile_id, related_name, relationship_type, confidence, source_id
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(
        input.id,
        relationship.name,
        relationship.type ?? "possible associate",
        relationship.confidence ?? "Medium",
        relationship.sourceId ?? null,
      );
    }

    if (input.sourceRecord) {
      db.prepare(
        `
        INSERT INTO source_records (source_id, source_record_id, profile_id, raw_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_id, source_record_id) DO UPDATE SET
          profile_id = excluded.profile_id,
          raw_json = excluded.raw_json,
          imported_at = CURRENT_TIMESTAMP
      `,
      ).run(
        input.sourceRecord.sourceId,
        input.sourceRecord.sourceRecordId,
        input.id,
        JSON.stringify(input.sourceRecord.raw),
      );
    }
  });

  tx();
}

export function createPrivacyRequest(input: {
  type: string;
  profileId?: string | null;
  requesterName: string;
  requesterEmail: string;
  details: string;
}) {
  const info = getDb()
    .prepare(
      `
      INSERT INTO privacy_requests (
        type, profile_id, requester_name, requester_email, details
      )
      VALUES (@type, @profileId, @requesterName, @requesterEmail, @details)
    `,
    )
    .run({
      ...input,
      profileId: input.profileId || null,
    });

  return Number(info.lastInsertRowid);
}

export function createAbuseReport(input: {
  profileId?: string | null;
  reporterName: string;
  reporterEmail: string;
  details: string;
}) {
  const info = getDb()
    .prepare(
      `
      INSERT INTO abuse_reports (profile_id, reporter_name, reporter_email, details)
      VALUES (@profileId, @reporterName, @reporterEmail, @details)
    `,
    )
    .run({
      ...input,
      profileId: input.profileId || null,
    });

  return Number(info.lastInsertRowid);
}

export function listPrivacyRequests(): PrivacyRequest[] {
  return getDb()
    .prepare(
      `
      SELECT
        id,
        type,
        status,
        profile_id AS profileId,
        requester_name AS requesterName,
        requester_email AS requesterEmail,
        details,
        created_at AS createdAt,
        reviewed_at AS reviewedAt
      FROM privacy_requests
      ORDER BY created_at DESC
      LIMIT 100
    `,
    )
    .all() as PrivacyRequest[];
}

export function approvePrivacyRequest(id: number, actor = "local-admin") {
  const db = getDb();
  const request = db
    .prepare("SELECT * FROM privacy_requests WHERE id = ?")
    .get(id) as
    | {
        id: number;
        profile_id: string | null;
      }
    | undefined;

  if (!request) {
    return false;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE privacy_requests
      SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, review_note = 'Approved in local admin console'
      WHERE id = ?
    `,
    ).run(id);

    if (request.profile_id) {
      db.prepare("UPDATE profiles SET suppressed_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        request.profile_id,
      );
      db.prepare(
        `
        INSERT INTO suppression_entries (type, value, normalized_value, reason)
        VALUES ('profile_id', ?, ?, 'approved opt-out')
      `,
      ).run(request.profile_id, request.profile_id);
    }

    db.prepare(
      `
      INSERT INTO admin_audit_logs (actor, action, target_type, target_id, details)
      VALUES (?, 'approve_privacy_request', 'privacy_request', ?, ?)
    `,
    ).run(actor, String(id), JSON.stringify({ profileId: request.profile_id }));
  });

  tx();
  return true;
}

function toSearchResult(row: DbProfileRow): SearchResult {
  return {
    id: row.id,
    name: row.full_name,
    ageRange: row.age_range,
    confidence: row.confidence,
    locations: getLocations(row.id),
    relatives: getRelationships(row.id),
  };
}

function getLocations(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT city, state
      FROM profile_locations
      WHERE profile_id = ?
      ORDER BY display_order, id
      LIMIT 4
    `,
    )
    .all(profileId) as Array<{ city: string; state: string }>;
  return rows.map((row) => `${row.city}, ${row.state}`);
}

function getAddressHistory(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT street, city, state, zip
      FROM profile_locations
      WHERE profile_id = ?
      ORDER BY display_order, id
    `,
    )
    .all(profileId) as Array<{
    street: string | null;
    city: string;
    state: string;
    zip: string | null;
  }>;

  return rows.map((row) =>
    [row.street, row.city, row.state, row.zip].filter(Boolean).join(", "),
  );
}

function getRelationships(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT related_name
      FROM relationships
      WHERE profile_id = ?
      ORDER BY id
      LIMIT 4
    `,
    )
    .all(profileId) as Array<{ related_name: string }>;
  return rows.map((row) => row.related_name);
}

function getAliases(profileId: string) {
  const rows = getDb()
    .prepare("SELECT alias FROM profile_aliases WHERE profile_id = ? ORDER BY id")
    .all(profileId) as Array<{ alias: string }>;
  return rows.map((row) => row.alias);
}

function getContacts(profileId: string, type: "phone" | "email") {
  const rows = getDb()
    .prepare(
      `
      SELECT display_value
      FROM profile_contacts
      WHERE profile_id = ? AND type = ? AND display_allowed = 1
      ORDER BY id
    `,
    )
    .all(profileId, type) as Array<{ display_value: string }>;
  return rows.map((row) => row.display_value);
}

function getSourceCategories(profileId: string) {
  const rows = getDb()
    .prepare(
      `
      SELECT DISTINCT s.category
      FROM approved_sources s
      JOIN source_records r ON r.source_id = s.id
      WHERE r.profile_id = ?
      ORDER BY s.category
    `,
    )
    .all(profileId) as Array<{ category: string }>;

  return rows.map((row) => row.category);
}

type DbProfileRow = {
  id: string;
  full_name: string;
  normalized_name: string;
  age_range: string;
  confidence: string;
  suppressed_at: string | null;
};
