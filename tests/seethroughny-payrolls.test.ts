import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  upsertApprovedSource: vi.fn(),
  upsertProfile: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMocks);

import {
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
