import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));

// The adapter reads the bulk CSV via `readFileSync` from "fs". Replace it with
// a controllable mock so ingest tests never touch the real filesystem.
vi.mock("fs", async (orig) => {
  const actual = (await orig()) as typeof import("fs");
  return { ...actual, readFileSync: vi.fn() };
});

import { readFileSync } from "fs";
import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  ingestOhioSosBusinessFromFile,
  mapOhioSosBusinessRowToProfileInput,
} from "@/lib/sources/ohio-sos-business";

// Sample Ohio SoS business entity/officer CSV (columns match the bulk download
// headers the adapter reads via csv-parse with `columns: true`).
const SAMPLE_CSV = [
  "BUSINESS_NUMBER,BUSINESS_NAME,AGENT_NAME,AGENT_TYPE,AGENT_ADDRESS1,AGENT_CITY,AGENT_STATE,AGENT_ZIP",
  "1234567,Acme Widgets LLC,Jane Q Smith,Statutory Agent,50 Office Pkwy,Columbus,OH,43215",
  "2345678,Riverside Holdings Inc,Robert A Johnson,Agent,110 River Rd Apt 4,Cleveland,OH,44113",
  "3456789,Bluebird Ventures LLC,Jane Smith,Officer,22 Summit St,Cincinnati,OH,45202",
  "4567890,No Agent LLC,,Statutory Agent,1 Main St,Toledo,OH,43604",
].join("\n");

describe("Ohio SoS business mapping", () => {
  it("maps a registered agent with a business address", () => {
    const profile = mapOhioSosBusinessRowToProfileInput(
      {
        BUSINESS_NUMBER: "1234567",
        BUSINESS_NAME: "Example LLC",
        AGENT_NAME: "Jordan Lee",
        AGENT_TYPE: "Statutory Agent",
        AGENT_ADDRESS1: "50 Office Pkwy",
        AGENT_CITY: "Columbus",
        AGENT_STATE: "OH",
        AGENT_ZIP: "43215",
      },
      "",
    );

    expect(profile?.fullName).toBe("Jordan Lee");
    expect(profile?.aliases).toContain("Ohio business: Example LLC");
    expect(profile?.aliases).toContain("Role: Statutory Agent");
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Columbus",
      state: "OH",
      kind: "Ohio business/registered-agent address",
    });
  });

  it("filters to the query name when provided", () => {
    const row = { AGENT_NAME: "Jordan Lee", BUSINESS_NAME: "Co", AGENT_CITY: "Columbus", AGENT_STATE: "OH" };
    expect(mapOhioSosBusinessRowToProfileInput(row, "Jordan Lee")).not.toBeNull();
    expect(mapOhioSosBusinessRowToProfileInput(row, "Nobody Match")).toBeNull();
  });

  it("skips rows without an agent/officer name", () => {
    expect(
      mapOhioSosBusinessRowToProfileInput(
        { BUSINESS_NAME: "No Agent LLC", BUSINESS_NUMBER: "9" },
        "",
      ),
    ).toBeNull();
  });
});

describe("Ohio SoS ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CSV);
  });

  it("reads the CSV file, filters to the query, and upserts matching profiles", async () => {
    // Query "Jane Smith" matches both "Jane Q Smith" and "Jane Smith" (token
    // subset match via normalizeName), but not "Robert A Johnson" or the empty
    // agent row.
    const result = await ingestOhioSosBusinessFromFile({
      file: "fake-ohio-business.csv",
      query: "Jane Smith",
    });

    expect(result.fetched).toBe(4);
    expect(result.imported).toBe(2);
    expect(result.url).toBe("fake-ohio-business.csv");
    expect(upsertProfile).toHaveBeenCalledTimes(2);

    const upserted = upsertProfile.mock.calls.map((c) => c[0]);
    const names = upserted.map((p) => p.fullName).sort();
    expect(names).toEqual(["Jane Q Smith", "Jane Smith"]);

    const first = upserted[0];
    expect(first.id).toMatch(/^p_ohio_sos_jane/);
    expect(first.ageRange).toBe("Unknown");
    expect(first.confidence).toBe("Low");
    expect(first.sourceRecord?.sourceId).toBe("ohio_sos_business_entities");
    expect(first.sourceRecord?.raw).toMatchObject({
      BUSINESS_NAME: expect.stringMatching(/Acme Widgets LLC|Bluebird Ventures LLC/),
    });
    // Business/agent address is carried as context, marked non-residential.
    expect(first.locations?.[0]).toMatchObject({
      state: "OH",
      kind: "Ohio business/registered-agent address",
    });

    // The source registry entry is upserted exactly once per ingest.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ohio_sos_business_entities",
        jurisdiction: "Ohio",
        acquisitionMethod: "official_bulk",
      }),
    );

    // The file path is passed through to readFileSync (utf8).
    expect(readFileSync).toHaveBeenCalledWith("fake-ohio-business.csv", "utf8");
  });

  it("imports every named row when no query is provided", async () => {
    const result = await ingestOhioSosBusinessFromFile({
      file: "fake-ohio-business.csv",
    });

    // 4 rows, one has an empty agent name -> 3 importable profiles.
    expect(result.fetched).toBe(4);
    expect(result.imported).toBe(3);
    expect(upsertProfile).toHaveBeenCalledTimes(3);
  });

  it("imports nothing when the query matches no agent/officer", async () => {
    const result = await ingestOhioSosBusinessFromFile({
      file: "fake-ohio-business.csv",
      query: "Nobody Here",
    });

    expect(result.fetched).toBe(4);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
    // Source is still registered even with zero imports.
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
  });

  it("imports nothing from an empty file", async () => {
    vi.mocked(readFileSync).mockReturnValue("");

    const result = await ingestOhioSosBusinessFromFile({
      file: "empty.csv",
      query: "Jane Smith",
    });

    expect(result.fetched).toBe(0);
    expect(result.imported).toBe(0);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
