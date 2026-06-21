import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  upsertProfile: vi.fn(),
  upsertApprovedSource: vi.fn(),
}));
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "node:fs";
import { upsertApprovedSource, upsertProfile } from "@/lib/db";
import {
  HCAD_SOURCE_ID,
  ingestHcad,
  mapHcadBusinessAccountToProfileInput,
  mapHcadOwnerToProfileInput,
  parseHcadBusinessAccounts,
  parseHcadOwners,
  parseHcadRealAccounts,
  type HcadOwnerRecord,
  type HcadRealAccountRecord,
} from "@/lib/sources/hcad";

describe("HCAD owner/property text source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockReset();
  });

  it("parses headerless owners and headered real_acct tab-delimited rows", () => {
    const owners = parseHcadOwners(
      [
        "1234567890123\t1\tJane Q Smith\tJane Smith\t100.00",
        "1234567890124\t2\tAcme Holdings LLC\t\t50.00",
      ].join("\n"),
    );
    expect(owners).toHaveLength(2);
    expect(owners[0]).toMatchObject({
      account: "1234567890123",
      lineNumber: "1",
      name: "Jane Q Smith",
      aka: "Jane Smith",
      percentOwned: "100.00",
    });

    const realAccounts = parseHcadRealAccounts(
      [
        "acct\ttax_year\tmailto\tmail_addr_1\tmail_city\tmail_state\tmail_zip\tsite_addr_1\tsite_city\tsite_state\tsite_zip\tstate_class\tcertified_date",
        "1234567890123\t2026\tJane Q Smith\tPO Box 42\tHouston\tTX\t77002\t100 Main St\tHouston\tTX\t77003\tA1\t08/15/2026",
      ].join("\n"),
    );
    expect(realAccounts).toHaveLength(1);
    expect(realAccounts[0]).toMatchObject({
      account: "1234567890123",
      taxYear: "2026",
      ownerName: "Jane Q Smith",
      stateClass: "A1",
      certifiedDate: "08/15/2026",
      mailingAddress: {
        street: "PO Box 42",
        city: "Houston",
        state: "TX",
        zip: "77002",
      },
      situsAddress: {
        street: "100 Main St",
        city: "Houston",
        state: "TX",
        zip: "77003",
      },
    });
  });

  it("parses official headerless real_acct situs city and ZIP without treating them as street text", () => {
    const row = Array.from({ length: 70 }, () => "");
    row[0] = "1234567890123";
    row[1] = "2026";
    row[2] = "Jane Q Smith";
    row[3] = "PO Box 42";
    row[5] = "Houston";
    row[6] = "TX";
    row[7] = "77002";
    row[17] = "100 Main St";
    row[18] = "Houston";
    row[19] = "77003";
    row[20] = "A1";
    row[62] = "08/15/2026";

    const [account] = parseHcadRealAccounts(row.join("\t"));

    expect(account).toMatchObject({
      account: "1234567890123",
      taxYear: "2026",
      certifiedDate: "08/15/2026",
      mailingAddress: {
        street: "PO Box 42",
        city: "Houston",
        state: "TX",
        zip: "77002",
      },
      situsAddress: {
        street: "100 Main St",
        city: "Houston",
        state: "TX",
        zip: "77003",
      },
    });
  });

  it("maps owners to profile records with source-observed address roles", () => {
    const owner: HcadOwnerRecord = {
      account: "1234567890123",
      lineNumber: "1",
      name: "Jane Q Smith",
      aka: "Jane Smith",
      percentOwned: "100.00",
      raw: {},
    };
    const account: HcadRealAccountRecord = {
      account: "1234567890123",
      taxYear: "2026",
      stateClass: "A1",
      certifiedDate: "08/15/2026",
      mailingAddress: {
        street: "PO Box 42",
        city: "Houston",
        state: "TX",
        zip: "77002",
      },
      situsAddress: {
        street: "100 Main St",
        city: "Houston",
        state: "TX",
        zip: "77003",
      },
      raw: {},
    };

    const profile = mapHcadOwnerToProfileInput(owner, account);

    expect(profile?.id).toBe("p_hcad_1234567890123_jane_q_smith_1");
    expect(profile?.fullName).toBe("Jane Q Smith");
    expect(profile?.aliases).toEqual(
      expect.arrayContaining([
        "AKA: Jane Smith",
        "Percent ownership: 100.00",
        "Tax year: 2026",
        "State class: A1",
      ]),
    );
    expect(profile?.locations).toEqual([
      {
        street: "100 Main St",
        city: "Houston",
        state: "TX",
        zip: "77003",
        kind: "property/situs address",
        sourceId: HCAD_SOURCE_ID,
      },
      {
        street: "PO Box 42",
        city: "Houston",
        state: "TX",
        zip: "77002",
        kind: "owner mailing address",
        sourceId: HCAD_SOURCE_ID,
      },
    ]);
    expect(profile?.locations?.map((location) => location.kind)).not.toContain(
      "current residence",
    );
    expect(profile?.sourceRecord).toMatchObject({
      sourceId: HCAD_SOURCE_ID,
      sourceRecordId: "1234567890123_1",
    });
  });

  it("maps personal-property account phones as source-backed contacts", () => {
    const row = Array.from({ length: 39 }, () => "");
    row[0] = "9876543";
    row[1] = "2026";
    row[2] = "Jane Q Smith";
    row[3] = "Jane Smith Consulting LLC";
    row[4] = "300 Commerce St";
    row[5] = "Houston";
    row[6] = "TX";
    row[7] = "77010";
    row[9] = "PO Box 99";
    row[11] = "Houston";
    row[12] = "TX";
    row[13] = "77002";
    row[14] = "(713) 555-0100";
    row[19] = "B";
    row[21] = "PP";
    row[23] = "8742";
    row[36] = "08/15/2026";

    const [businessAccount] = parseHcadBusinessAccounts(row.join("\t"));
    expect(businessAccount).toMatchObject({
      account: "9876543",
      taxYear: "2026",
      name: "Jane Q Smith",
      businessName: "Jane Smith Consulting LLC",
      phone: "(713) 555-0100",
      scheduleCode: "B",
      classCode: "PP",
      sic: "8742",
      certifiedDate: "08/15/2026",
      siteAddress: {
        street: "300 Commerce St",
        city: "Houston",
        state: "TX",
        zip: "77010",
      },
      mailingAddress: {
        street: "PO Box 99",
        city: "Houston",
        state: "TX",
        zip: "77002",
      },
    });

    const profile = mapHcadBusinessAccountToProfileInput(businessAccount);
    expect(profile?.contacts).toEqual([
      {
        type: "phone",
        value: "(713) 555-0100",
        confidence: "Low",
        sourceId: HCAD_SOURCE_ID,
      },
    ]);
    expect(profile?.locations?.map((location) => location.kind)).toEqual([
      "business personal-property site address",
      "business personal-property mailing address",
    ]);
    expect(profile?.locations?.map((location) => location.kind)).not.toContain(
      "current residence",
    );
  });

  it("does not infer invalid personal-property phones", () => {
    const records = parseHcadBusinessAccounts(
      [
        "acct\tname\tphone",
        "9876543\tJane Q Smith\t12345",
        "\tMissing Account\t(713) 555-0100",
      ].join("\n"),
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      account: "9876543",
      name: "Jane Q Smith",
    });
    expect(records[0].phone).toBeUndefined();
  });

  it("skips malformed or empty rows", () => {
    expect(parseHcadOwners("\t1\tMissing Account\n123\t2\t\tAKA")).toEqual([]);
    expect(parseHcadRealAccounts("acct\ttax_year\n\t2026")).toEqual([]);
    expect(parseHcadBusinessAccounts("acct\tname\tphone\n\tJane\t(713) 555-0100")).toEqual(
      [],
    );
    expect(mapHcadOwnerToProfileInput({ account: "1", name: "", raw: {} })).toBeNull();
    expect(
      mapHcadBusinessAccountToProfileInput({ account: "1", name: "", raw: {} }),
    ).toBeNull();
  });

  it("reads files, filters by query tokens, and upserts matching profiles", async () => {
    vi.mocked(readFileSync).mockImplementation((file) => {
      if (String(file).includes("owners")) {
        return [
          "1234567890123\t1\tJane Q Smith\tJane Smith\t100.00",
          "1234567890124\t1\tAlex Rivera\t\t100.00",
        ].join("\n");
      }
      return [
        "acct\ttax_year\tmailto\tmail_addr_1\tmail_city\tmail_state\tmail_zip\tsite_addr_1\tsite_city\tsite_state\tsite_zip\tstate_class\tcertified_date",
        "1234567890123\t2026\tJane Q Smith\tPO Box 42\tHouston\tTX\t77002\t100 Main St\tHouston\tTX\t77003\tA1\t08/15/2026",
        "1234567890124\t2026\tAlex Rivera\tPO Box 7\tHouston\tTX\t77004\t200 Oak St\tHouston\tTX\t77005\tA1\t08/15/2026",
      ].join("\n");
    });

    const result = await ingestHcad({
      ownersFile: "/tmp/owners.txt",
      realAcctFile: "/tmp/real_acct.txt",
      query: "Jane Smith",
    });

    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(upsertApprovedSource).toHaveBeenCalledTimes(1);
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.fullName).toBe("Jane Q Smith");
    expect(profile.locations?.[0]).toMatchObject({
      street: "100 Main St",
      kind: "property/situs address",
    });
    expect(profile.contacts).toEqual([]);
  });

  it("reads optional business account files and imports query-matched account phones", async () => {
    vi.mocked(readFileSync).mockImplementation((file) => {
      if (String(file).includes("owners")) {
        return "1234567890124\t1\tAlex Rivera\t\t100.00";
      }
      if (String(file).includes("business")) {
        return [
          "acct\ttax_year\tname\tbus_name\tsite_addr\tsite_city\tsite_state\tsite_zip\tmail_addr_1\tmail_city\tmail_state\tmail_zip\tphone\tsched_cd\tclass_code\tsic\tcertified_date",
          "9876543\t2026\tJane Q Smith\tJane Smith Consulting LLC\t300 Commerce St\tHouston\tTX\t77010\tPO Box 99\tHouston\tTX\t77002\t713-555-0100\tB\tPP\t8742\t08/15/2026",
          "9876544\t2026\tAlex Rivera\tAlex Services LLC\t400 Market St\tHouston\tTX\t77011\tPO Box 7\tHouston\tTX\t77004\t713-555-0101\tB\tPP\t8742\t08/15/2026",
        ].join("\n");
      }
      return [
        "acct\ttax_year\tmailto\tmail_addr_1\tmail_city\tmail_state\tmail_zip\tsite_addr_1\tsite_city\tsite_state\tsite_zip\tstate_class\tcertified_date",
        "1234567890124\t2026\tAlex Rivera\tPO Box 7\tHouston\tTX\t77004\t200 Oak St\tHouston\tTX\t77005\tA1\t08/15/2026",
      ].join("\n");
    });

    const result = await ingestHcad({
      ownersFile: "/tmp/owners.txt",
      realAcctFile: "/tmp/real_acct.txt",
      businessAcctFile: "/tmp/t_business_acct.txt",
      query: "Jane Smith",
    });

    expect(result).toMatchObject({ fetched: 1, imported: 1 });
    expect(upsertProfile).toHaveBeenCalledTimes(1);
    const profile = vi.mocked(upsertProfile).mock.calls[0][0];
    expect(profile.fullName).toBe("Jane Q Smith");
    expect(profile.contacts).toEqual([
      {
        type: "phone",
        value: "713-555-0100",
        confidence: "Low",
        sourceId: HCAD_SOURCE_ID,
      },
    ]);
    expect(profile.sourceRecord?.sourceRecordId).toBe("business_9876543");
  });
});
