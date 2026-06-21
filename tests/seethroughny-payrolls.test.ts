import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
  ingestSeeThroughNyPayrolls,
  mapSeeThroughNyRecordToProfileInput,
  parseResultRows,
  registerSeeThroughNyPayrollsSource,
} from "@/lib/sources/seethroughny-payrolls";

// A trimmed but faithful excerpt of the SeeThroughNY JSON `html` payload:
// each employee is a resultRow{n} followed by a hidden expandRow{n} carrying
// the labeled detail cells (Title, Pay Year, Pay Basis, Branch).
const SAMPLE_HTML = `
<table class="filter_results">
  <tbody>
    <tr id="resultRow102803951" onclick="stnyResultTable.toggleRow(102803951); return false;">
      <td><a href="#"><i class="glyphicon glyphicon-plus"></i></a></td>
      <td>Cuomo Soares, Dawn M</td>
      <td>Citywide Admin Svcs, Department of</td>
      <td>$96,809</td>
      <td class="visible-sm visible-md visible-lg">Citywide Admin Svcs, Department Of</td>
    </tr>
    <tr id="expandRow102803951" style="display: none;">
      <td>&nbsp;</td>
      <td colspan="5">
        <div class="row visible-xs-block">
          <div class="col-xs-4"><strong>SubAgency/Type</strong></div>
          <div class="col-xs-6">Citywide Admin Svcs, Department Of</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Title</strong></div>
          <div class="col-xs-6">Community Coordinator</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Rate of Pay</strong></div>
          <div class="col-xs-6">$92,287</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Pay Year</strong></div>
          <div class="col-xs-6">2023</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Pay Basis</strong></div>
          <div class="col-xs-6">per Annum</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Branch/Major Category</strong></div>
          <div class="col-xs-6">New York City</div>
        </div>
      </td>
    </tr>
    <tr id="resultRow110541124" onclick="stnyResultTable.toggleRow(110541124); return false;">
      <td><a href="#"><i class="glyphicon glyphicon-plus"></i></a></td>
      <td>Smith, John A</td>
      <td>Eastport-South Manor CSD</td>
      <td>$61,837</td>
      <td class="visible-sm visible-md visible-lg">NYSTRS - Educator</td>
    </tr>
    <tr id="expandRow110541124" style="display: none;">
      <td>&nbsp;</td>
      <td colspan="5">
        <div class="row visible-xs-block">
          <div class="col-xs-4"><strong>SubAgency/Type</strong></div>
          <div class="col-xs-6">NYSTRS - Educator</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Title</strong></div>
          <div class="col-xs-6">Teacher</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Pay Year</strong></div>
          <div class="col-xs-6">2023</div>
        </div>
        <div class="row">
          <div class="col-xs-4"><strong>Branch/Major Category</strong></div>
          <div class="col-xs-6">Schools</div>
        </div>
      </td>
    </tr>
  </tbody>
</table>`;

describe("SeeThroughNY payrolls source", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
  });

  it("parses result rows and their detail cells", () => {
    const rows = parseResultRows(SAMPLE_HTML);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toMatchObject({
      rowId: "102803951",
      name: "Cuomo Soares, Dawn M",
      employer: "Citywide Admin Svcs, Department of",
      totalPay: "$96,809",
      title: "Community Coordinator",
      payYear: "2023",
      payBasis: "per Annum",
      branch: "New York City",
    });

    expect(rows[1]).toMatchObject({
      rowId: "110541124",
      name: "Smith, John A",
      employer: "Eastport-South Manor CSD",
      title: "Teacher",
      payYear: "2023",
      branch: "Schools",
    });
  });

  it("maps a payroll record to a context profile", () => {
    const profile = mapSeeThroughNyRecordToProfileInput(
      {
        rowId: "102803951",
        name: "Cuomo Soares, Dawn M",
        employer: "Citywide Admin Svcs, Department of",
        totalPay: "$96,809",
        title: "Community Coordinator",
        payYear: "2023",
        payBasis: "per Annum",
        branch: "New York City",
      },
      "Cuomo Soares, Dawn M",
    );

    expect(profile?.id).toBe("p_seethroughny_cuomo_soares_dawn_m");
    expect(profile?.fullName).toBe("Cuomo Soares, Dawn M");
    expect(profile?.aliases).toContain(
      "Last known institution: Citywide Admin Svcs, Department of",
    );
    expect(profile?.aliases).toContain("Title: Community Coordinator");
    expect(profile?.aliases).toContain("Year: 2023");
    expect(profile?.aliases).toContain("Branch: New York City");
    expect(profile?.sourceRecord?.sourceId).toBe("seethroughny_payrolls");
    expect(profile?.sourceRecord?.sourceRecordId).toBe(
      "cuomo_soares_dawn_m__citywide_admin_svcs_department_of__102803951",
    );
    expect(profile?.sourceRecord?.raw).toMatchObject({
      matchedEmployee: "Cuomo Soares, Dawn M",
    });
    expect(profile?.locations?.[0]).toMatchObject({
      city: "Citywide Admin Svcs, Department of",
      state: "NY",
      kind: "public payroll affiliation",
    });
    expect(profile?.contacts).toEqual([]);
  });

  it("registers the source with public-payroll metadata", () => {
    registerSeeThroughNyPayrollsSource();

    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "seethroughny_payrolls",
        category: "Public payroll record",
        jurisdiction: "New York State",
        acquisitionMethod: "official_api",
      }),
    );
  });

  it("skips records without a name", () => {
    expect(
      mapSeeThroughNyRecordToProfileInput(
        { employer: "Department of Labor", title: "Clerk" },
        "",
      ),
    ).toBeNull();
  });

  it("parses no rows from an empty payload", () => {
    expect(parseResultRows("")).toEqual([]);
    expect(parseResultRows('<table><tbody></tbody></table>')).toEqual([]);
  });
});

// A realistic SeeThroughNY search response: the `html` field holds the result
// rows as table markup (see SAMPLE_HTML shape above), and the paging metadata
// (total_pages, result_id, current_page) governs the fetch loop.
const INGEST_HTML = `
<table class="filter_results">
  <tbody>
    <tr id="resultRow200000001" onclick="stnyResultTable.toggleRow(200000001); return false;">
      <td><a href="#"><i class="glyphicon glyphicon-plus"></i></a></td>
      <td>Smith, Jane B</td>
      <td>City of Rochester</td>
      <td>$78,421</td>
      <td class="visible-sm visible-md visible-lg">Municipal</td>
    </tr>
    <tr id="expandRow200000001" style="display: none;">
      <td>&nbsp;</td>
      <td colspan="5">
        <div class="row"><div class="col-xs-4"><strong>Title</strong></div><div class="col-xs-6">Senior Accountant</div></div>
        <div class="row"><div class="col-xs-4"><strong>Pay Year</strong></div><div class="col-xs-6">2023</div></div>
        <div class="row"><div class="col-xs-4"><strong>Pay Basis</strong></div><div class="col-xs-6">per Annum</div></div>
        <div class="row"><div class="col-xs-4"><strong>Branch/Major Category</strong></div><div class="col-xs-6">Local Government</div></div>
      </td>
    </tr>
    <tr id="resultRow200000002" onclick="stnyResultTable.toggleRow(200000002); return false;">
      <td><a href="#"><i class="glyphicon glyphicon-plus"></i></a></td>
      <td>Doe, John C</td>
      <td>State of New York</td>
      <td>$112,000</td>
      <td class="visible-sm visible-md visible-lg">State</td>
    </tr>
    <tr id="expandRow200000002" style="display: none;">
      <td>&nbsp;</td>
      <td colspan="5">
        <div class="row"><div class="col-xs-4"><strong>Title</strong></div><div class="col-xs-6">Director</div></div>
        <div class="row"><div class="col-xs-4"><strong>Pay Year</strong></div><div class="col-xs-6">2023</div></div>
        <div class="row"><div class="col-xs-4"><strong>Branch/Major Category</strong></div><div class="col-xs-6">Executive</div></div>
      </td>
    </tr>
  </tbody>
</table>`;

function jsonResponse(overrides: Partial<{
  html: string;
  total_pages: number;
  result_id: string;
  current_page: number | null;
}> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      html: INGEST_HTML,
      total_records: "2",
      total_pages: 1,
      current_page: null,
      result_id: "abc123",
      ...overrides,
    }),
  } as any;
}

describe("SeeThroughNY payroll ingest", () => {
  beforeEach(() => {
    dbMocks.upsertApprovedSource.mockClear();
    dbMocks.upsertProfile.mockClear();
    vi.restoreAllMocks();
  });

  it("fetches, parses, filters, and upserts matching payroll profiles", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse());

    const result = await ingestSeeThroughNyPayrolls({
      firstName: "Jane",
      lastName: "Smith",
    });

    // Single page (total_pages=1) => exactly one POST to the JSON endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://www.seethroughny.net/tools/required/reports/payroll?action=get",
    );
    expect(init?.method).toBe("POST");
    const body = String((init as RequestInit)?.body ?? "");
    // The adapter searches by "Last First" to keep the candidate set small.
    expect(body).toContain("WholeName=Smith+Jane");
    // Recent pay-year filter is appended to bound the candidate set.
    expect(body).toMatch(/PayYear%5B%5D=\d{4}/);

    // The matching record (Smith, Jane B) is imported; the non-matching
    // (Doe, John C) is filtered out by the full-name token check.
    expect(result.imported).toBe(1);
    expect(result.fetched).toBe(2);
    expect(dbMocks.upsertProfile).toHaveBeenCalledTimes(1);

    const profile = dbMocks.upsertProfile.mock.calls[0][0];
    expect(profile.fullName).toBe("Smith, Jane B");
    expect(profile.id).toBe("p_seethroughny_smith_jane_b");
    expect(profile.confidence).toBe("Medium");
    expect(profile.ageRange).toBe("Unknown");
    expect(profile.aliases).toContain(
      "Last known institution: City of Rochester",
    );
    expect(profile.aliases).toContain("Title: Senior Accountant");
    expect(profile.aliases).toContain("Year: 2023");
    expect(profile.aliases).toContain("Branch: Local Government");
    expect(profile.locations?.[0]).toMatchObject({
      city: "City of Rochester",
      state: "NY",
      kind: "public payroll affiliation",
      sourceId: "seethroughny_payrolls",
    });
    expect(profile.sourceRecord?.sourceId).toBe("seethroughny_payrolls");
    expect(profile.sourceRecord?.raw).toMatchObject({
      matchedEmployee: "Smith, Jane B",
    });

    // Ingest always registers the approved source first.
    expect(dbMocks.upsertApprovedSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: "seethroughny_payrolls" }),
    );
  });

  it("returns zero results and skips fetch when no name is given", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await ingestSeeThroughNyPayrolls({});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.fetched).toBe(0);
    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("uses the query fallback to derive first/last name", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse());

    await ingestSeeThroughNyPayrolls({ query: "Jane Smith" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String(
      (fetchMock.mock.calls[0][1] as RequestInit)?.body ?? "",
    );
    // tokenizeName normalizes to lowercase, so the WholeName is lowercased.
    expect(body).toContain("WholeName=smith+jane");
  });

  it("throws when the endpoint returns a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    } as any);

    await expect(
      ingestSeeThroughNyPayrolls({ firstName: "Jane", lastName: "Smith" }),
    ).rejects.toThrow(/SeeThroughNY payroll request failed: 500/);

    expect(dbMocks.upsertProfile).not.toHaveBeenCalled();
  });

  it("stops paging once total_pages is reached without extra fetches", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({ total_pages: 1, current_page: null }),
      );

    await ingestSeeThroughNyPayrolls({ firstName: "Jane", lastName: "Smith" });

    // total_pages=1 means one page only, no follow-up requests.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
