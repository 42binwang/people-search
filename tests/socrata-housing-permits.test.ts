import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateSocrataHousingPermitRows,
  buildSocrataHousingPermitsUrl,
  ingestSocrataHousingPermits,
} from "@/lib/sources/socrata-housing-permits";

const source = {
  sourceId: "seattle_issued_building_permits_aggregate",
  sourceName: "Seattle Issued Building Permits",
  hub: "Greater Seattle",
  city: "Seattle",
  state: "WA",
  domain: "data.seattle.gov",
  datasetId: "8tqq-u7ib",
  fields: {
    date: "issueddate",
    category: "permitclassmapped",
    unitsAdded: "housingunitsadded",
    unitsRemoved: "housingunitsremoved",
    estimatedCost: "estprojectcost",
  },
};

describe("Socrata housing permit aggregate source", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds Socrata URLs that request only configured non-personal fields", () => {
    const url = new URL(
      buildSocrataHousingPermitsUrl(
        {
          ...source,
          where: "issueddate >= '2020-01-01T00:00:00'",
        },
        100,
        200,
      ),
    );

    expect(url.hostname).toBe("data.seattle.gov");
    expect(url.pathname).toBe("/resource/8tqq-u7ib.json");
    expect(url.searchParams.get("$select")).toBe(
      "issueddate,permitclassmapped,housingunitsadded,housingunitsremoved,estprojectcost",
    );
    expect(url.searchParams.get("$limit")).toBe("100");
    expect(url.searchParams.get("$offset")).toBe("200");
    expect(url.searchParams.toString()).not.toContain("originaladdress");
    expect(url.searchParams.toString()).not.toContain("contractor");
  });

  it("aggregates permit rows by month and category", () => {
    const metrics = aggregateSocrataHousingPermitRows(
      [
        {
          issueddate: "2026-01-15T00:00:00",
          permitclassmapped: "Multifamily",
          housingunitsadded: "10",
          housingunitsremoved: "2",
          estprojectcost: "1000000",
        },
        {
          issueddate: "2026-01-30T00:00:00",
          permitclassmapped: "Multifamily",
          housingunitsadded: "5",
          housingunitsremoved: "0",
          estprojectcost: "250000",
        },
        {
          issueddate: "2026-02-02T00:00:00",
          permitclassmapped: "",
          housingunitsadded: "-",
          housingunitsremoved: "***",
        },
      ],
      source,
    );

    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({
      sourceRecordId: "2026-01-multifamily",
      hub: "Greater Seattle",
      city: "Seattle",
      state: "WA",
      periodMonth: "2026-01",
      category: "Multifamily",
      permitCount: 2,
      housingUnitsAdded: 15,
      housingUnitsRemoved: 2,
      netHousingUnits: 13,
      estimatedCost: 1250000,
    });
    expect(metrics[1]).toMatchObject({
      periodMonth: "2026-02",
      category: "Unknown",
      housingUnitsAdded: null,
      housingUnitsRemoved: null,
      netHousingUnits: null,
    });
  });

  it("throws explicit errors for malformed dates", () => {
    expect(() =>
      aggregateSocrataHousingPermitRows(
        [
          {
            issueddate: "not-a-date",
            permitclassmapped: "Residential",
          },
        ],
        source,
      ),
    ).toThrow("invalid date");
  });

  it("surfaces failed Socrata downloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      ingestSocrataHousingPermits({
        ...source,
        approved: true,
        pageSize: 1,
        maxPages: 1,
      } as typeof source & { approved: boolean; pageSize: number; maxPages: number }),
    ).rejects.toThrow("Socrata housing permits request failed: 503");
  });

  it("paginates selected fields and aggregates fetched rows", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              issueddate: "2026-03-01T00:00:00",
              permitclassmapped: "Residential",
              housingunitsadded: "1",
            },
          ]),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([])));

    const result = await ingestSocrataHousingPermits({
      ...source,
      pageSize: 1,
      maxPages: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      fetched: 1,
      imported: 1,
    });
  });

  it("throws explicit errors for non-JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 }),
    );

    await expect(
      ingestSocrataHousingPermits({
        ...source,
        pageSize: 1,
        maxPages: 1,
      }),
    ).rejects.toThrow("not valid JSON");
  });
});
