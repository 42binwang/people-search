# Aggregate Mobility Sources

This project supports aggregate residential mobility indicators separately from person/profile records. Aggregate mobility sources must not contain names, phone numbers, emails, device IDs, household-level records, or exact individual address histories.

## U.S. Census ACS 5-Year Residence One Year Ago

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP02`, "Residence 1 year ago" variables.

Adapter: `lib/sources/census-acs-mobility.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-mobility.ts -- --config=configs/mobility-sources/census-acs-2024-bay-area.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-mobility.ts -- --config=configs/mobility-sources/census-acs-2024-nyc.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-mobility.ts -- --config=configs/mobility-sources/census-acs-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/mobility-sources/census-acs-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/mobility-sources/census-acs-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/mobility-sources/census-acs-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_population_one_year_over` | `DP02_0079E` | Population 1 year and over |
| `same_house` / `same_house_pct` | `DP02_0080E` / `DP02_0080PE` | Same house 1 year ago |
| `different_house` / `different_house_pct` | `DP02_0081E` / `DP02_0081PE` | Different house in the U.S. or abroad |
| `different_house_us` | `DP02_0082E` | Different house in the U.S. |
| `moved_within_same_county` / `moved_within_same_county_pct` | `DP02_0083E` / `DP02_0083PE` | Different house in the same county |
| `moved_different_county` | `DP02_0084E` | Different house in a different county |
| `moved_different_county_same_state` / `moved_different_county_same_state_pct` | `DP02_0085E` / `DP02_0085PE` | Different county in the same state |
| `moved_different_state` / `moved_different_state_pct` | `DP02_0086E` / `DP02_0086PE` | Different state |
| `moved_from_abroad` / `moved_from_abroad_pct` | `DP02_0087E` / `DP02_0087PE` | Abroad |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API now requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level mobility estimates as proof that any person moved.
- Do not combine these metrics with individual profile records to infer individual movement, occupancy, or current residence.

Assumptions:

- "Bay Area" means the nine-county San Francisco Bay Area.
- "New York City" means the five borough counties.
- "Greater Seattle" means King, Pierce, and Snohomish counties as a practical Seattle-Tacoma-Bellevue tech-hub approximation.
- County-level ACS estimates are sufficient for initial aggregate mobility trend support. Tract-level support can be added later if the product needs finer geography and proper margin-of-error handling.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## U.S. Census ACS 5-Year Residential Tenure

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP04`, "Year householder moved into unit" variables.

Adapter: `lib/sources/census-acs-residential-tenure.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-residential-tenure.ts -- --config=configs/mobility-sources/census-acs-residential-tenure-2024-bay-area.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-residential-tenure.ts -- --config=configs/mobility-sources/census-acs-residential-tenure-2024-nyc.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-residential-tenure.ts -- --config=configs/mobility-sources/census-acs-residential-tenure-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/mobility-sources/census-acs-residential-tenure-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/mobility-sources/census-acs-residential-tenure-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/mobility-sources/census-acs-residential-tenure-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `occupied_housing_units` | `DP04_0050E` | Occupied housing units denominator |
| `moved_2023_or_later` / `moved_2023_or_later_pct` | `DP04_0051E` / `DP04_0051PE` | Householder moved into unit in 2023 or later |
| `moved_2020_to_2022` / `moved_2020_to_2022_pct` | `DP04_0052E` / `DP04_0052PE` | Householder moved into unit from 2020 to 2022 |
| `moved_2010_to_2019` / `moved_2010_to_2019_pct` | `DP04_0053E` / `DP04_0053PE` | Householder moved into unit from 2010 to 2019 |
| `moved_2000_to_2009` / `moved_2000_to_2009_pct` | `DP04_0054E` / `DP04_0054PE` | Householder moved into unit from 2000 to 2009 |
| `moved_1990_to_1999` / `moved_1990_to_1999_pct` | `DP04_0055E` / `DP04_0055PE` | Householder moved into unit from 1990 to 1999 |
| `moved_1989_or_earlier` / `moved_1989_or_earlier_pct` | `DP04_0056E` / `DP04_0056PE` | Householder moved into unit in 1989 or earlier |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- ACS residential tenure values are aggregate survey estimates, not observed household histories.
- Do not present county-level tenure buckets as proof of any person's move date, current address, occupancy, or residence history.
- Do not combine these metrics with individual profiles to infer personal movement, occupancy, or current residence.

Assumptions:

- County-level year-moved buckets are useful for distinguishing recent household turnover from long-term residential stability.
- The adapter stores the primary estimate and percentage fields and preserves raw response fields for provenance.
- Bucket labels are tied to the ACS release and should be reviewed when adding a new ACS year because the newest bucket may roll forward.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## U.S. Census ACS 5-Year Commuting Characteristics

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP03`, "Commuting to work" variables.

Adapter: `lib/sources/census-acs-commuting.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-commuting.ts -- --config=configs/mobility-sources/census-acs-commuting-2024-bay-area.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-commuting.ts -- --config=configs/mobility-sources/census-acs-commuting-2024-nyc.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-commuting.ts -- --config=configs/mobility-sources/census-acs-commuting-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/mobility-sources/census-acs-commuting-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/mobility-sources/census-acs-commuting-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/mobility-sources/census-acs-commuting-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_workers_16_over` | `DP03_0018E` | Workers 16 years and over |
| `drove_alone` / `drove_alone_pct` | `DP03_0019E` / `DP03_0019PE` | Car, truck, or van, drove alone |
| `carpooled` / `carpooled_pct` | `DP03_0020E` / `DP03_0020PE` | Car, truck, or van, carpooled |
| `public_transportation` / `public_transportation_pct` | `DP03_0021E` / `DP03_0021PE` | Public transportation |
| `walked` / `walked_pct` | `DP03_0022E` / `DP03_0022PE` | Walked |
| `other_means` / `other_means_pct` | `DP03_0023E` / `DP03_0023PE` | Other commute means |
| `worked_from_home` / `worked_from_home_pct` | `DP03_0024E` / `DP03_0024PE` | Worked from home |
| `mean_travel_time_minutes` | `DP03_0025E` | Mean travel time to work, in minutes |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- ACS commuting characteristics are aggregate survey estimates, not observed trips.
- Do not present county-level commute mode or work-from-home estimates as proof of any person's residence, workplace, or commute.
- Do not combine these metrics with individual profiles to infer personal movement, workplace, occupancy, or current residence.

Assumptions:

- County-level commute mode and work-from-home estimates are useful companion signals for interpreting aggregate mobility patterns.
- The adapter stores the primary estimate fields and preserves raw response fields for provenance.
- `DP03_0025PE` is intentionally not stored because the mean-travel-time estimate is represented by `DP03_0025E`, not a meaningful percentage for this use case.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## IRS SOI County-to-County Migration

Origin: Internal Revenue Service Statistics of Income (SOI) migration files.

Adapter: `lib/sources/irs-soi-migration.ts`

CLI:

```bash
npx tsx scripts/ingest-irs-soi-migration.ts -- --config=configs/mobility-sources/irs-soi-2022-2023-bay-area.json
npx tsx scripts/ingest-irs-soi-migration.ts -- --config=configs/mobility-sources/irs-soi-2022-2023-nyc.json
npx tsx scripts/ingest-irs-soi-migration.ts -- --config=configs/mobility-sources/irs-soi-2022-2023-greater-seattle.json
```

Current configs:

| Config | Coverage | Flow Type |
| --- | --- | --- |
| `configs/mobility-sources/irs-soi-2022-2023-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County-to-county inflow and outflow |
| `configs/mobility-sources/irs-soi-2022-2023-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County-to-county inflow and outflow |
| `configs/mobility-sources/irs-soi-2022-2023-greater-seattle.json` | King, Pierce, Snohomish | County-to-county inflow and outflow |

Stored fields:

| Stored field | IRS field | Meaning |
| --- | --- | --- |
| `year_start`, `year_end` | Config | Filing-year migration window |
| `flow_direction` | Config/file type | `inflow` or `outflow` relative to the configured hub county |
| `flow_kind` | Derived from special IRS FIPS rows | `county_to_county`, `total_us_and_foreign`, `total_us`, `total_same_state`, `total_different_state`, `total_foreign`, or `non_migrants` |
| `origin_state_fips`, `origin_county_fips` | `y1_*` fields | Prior-year county/state |
| `destination_state_fips`, `destination_county_fips` | `y2_*` fields | Current-year county/state |
| `returns_count` | `n1` | Number of tax returns |
| `individuals_count` | `n2` | Number of individuals represented on those returns |
| `adjusted_gross_income` | `agi` | Aggregate adjusted gross income |

Update frequency: IRS SOI migration files are released annually. The current configs use the 2022-2023 release, which the IRS page says was last reviewed or updated on March 20, 2026.

Usage restrictions:

- IRS SOI migration files are aggregate statistics derived from year-to-year address changes on individual income tax returns.
- Do not present IRS migration counts as complete population movement; they represent tax-return filers and associated individuals, not every resident.
- Do not combine these flows with individual profiles to infer personal movement, occupancy, or current residence.
- Keep the flow direction clear: inflow rows describe prior location to target county; outflow rows describe target county to next location.

Assumptions:

- The same tech-hub county definitions used for ACS configs are used for IRS configs.
- Both county-to-county rows and IRS special aggregate rows are stored because total U.S., foreign, same-state, different-state, and non-migrant rows are useful for regional mobility summaries.
- `agi` is stored as the aggregate value supplied by IRS; downstream analytics should label it as IRS adjusted gross income, not income per person.

Failure handling:

- Non-OK IRS downloads fail with status and status text.
- Empty CSV files fail before import.
- Rows missing required IRS headers fail with explicit errors.
- Suppressed or nonnumeric numeric values are stored as `null`.

## U.S. Census ACS 5-Year Migration Flows

Origin: U.S. Census Bureau American Community Survey 5-year Migration Flow API.

Adapter: `lib/sources/census-acs-migration-flows.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-migration-flows.ts -- --config=configs/mobility-sources/census-acs-flows-2022-bay-area.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-migration-flows.ts -- --config=configs/mobility-sources/census-acs-flows-2022-nyc.json
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-migration-flows.ts -- --config=configs/mobility-sources/census-acs-flows-2022-greater-seattle.json
```

Current configs:

| Config | Coverage | Flow Type |
| --- | --- | --- |
| `configs/mobility-sources/census-acs-flows-2022-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | ACS county migration-flow estimates into each reference county |
| `configs/mobility-sources/census-acs-flows-2022-nyc.json` | Bronx, Kings, New York, Queens, Richmond | ACS county migration-flow estimates into each reference county |
| `configs/mobility-sources/census-acs-flows-2022-greater-seattle.json` | King, Pierce, Snohomish | ACS county migration-flow estimates into each reference county |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `year_start`, `year_end` | Config | 5-year ACS period, currently 2018-2022 |
| `origin_state_fips`, `origin_county_fips` | `GEOID2` | Previous-year county/state represented by the second geography |
| `destination_state_fips`, `destination_county_fips` | `GEOID1` | Current reference county/state |
| `origin_name`, `destination_name` | `FULL2_NAME`, `FULL1_NAME` | Geography labels |
| `individuals_count` | `MOVEDIN` | Estimated inbound movers from the second geography to the reference geography |
| Raw JSON | `MOVEDIN_M`, `MOVEDOUT`, `MOVEDOUT_M`, `MOVEDNET`, `MOVEDNET_M` | Margins and related ACS flow statistics retained for provenance and future analytics |

Update frequency: ACS 5-year migration flow releases are periodic rather than annual for every flow type. The current configs use the 2018-2022 API release.

Usage restrictions:

- The Census API requires an API key for data requests.
- ACS migration flows are survey estimates, not complete administrative movement counts.
- Small flows are suppressed by Census disclosure avoidance rules; do not backfill suppressed values from other sources.
- Do not combine these flows with individual profiles to infer personal movement, occupancy, or current residence.

Assumptions:

- The adapter stores each flow as an aggregate inflow into the configured reference county.
- Same-origin/same-destination rows are classified as `non_movers`; all other rows are classified as `county_to_county`.
- Margins of error are retained in raw provenance for downstream analysis, while the common flow table stores the primary estimate in `individuals_count`.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, malformed GEOIDs, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimates are stored as `null`.

## U.S. Census LEHD LODES Origin-Destination Employment Flows

Origin: U.S. Census Bureau Longitudinal Employer-Household Dynamics (LEHD), LEHD Origin-Destination Employment Statistics (LODES), Version 8 Origin-Destination (OD) files.

Adapter: `lib/sources/census-lehd-lodes.ts`

CLI:

```bash
npx tsx scripts/ingest-census-lehd-lodes.ts -- --config=configs/mobility-sources/census-lehd-lodes-2023-bay-area.json
npx tsx scripts/ingest-census-lehd-lodes.ts -- --config=configs/mobility-sources/census-lehd-lodes-2023-nyc.json
npx tsx scripts/ingest-census-lehd-lodes.ts -- --config=configs/mobility-sources/census-lehd-lodes-2023-greater-seattle.json
```

Current configs:

| Config | Source File | Coverage |
| --- | --- | --- |
| `configs/mobility-sources/census-lehd-lodes-2023-bay-area.json` | California 2023 OD main all-jobs file | County-pair home/work flows involving Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, or Sonoma counties |
| `configs/mobility-sources/census-lehd-lodes-2023-nyc.json` | New York 2023 OD main all-jobs file | County-pair home/work flows involving Bronx, Kings, New York, Queens, or Richmond counties |
| `configs/mobility-sources/census-lehd-lodes-2023-greater-seattle.json` | Washington 2023 OD main all-jobs file | County-pair home/work flows involving King, Pierce, or Snohomish counties |

Stored fields:

| Stored field | LODES field | Meaning |
| --- | --- | --- |
| `home_state_fips`, `home_county_fips` | First five digits of `h_geocode` | Residence county of the worker aggregate |
| `work_state_fips`, `work_county_fips` | First five digits of `w_geocode` | Workplace county of the job aggregate |
| `total_jobs` | `S000` | Total jobs in the home/work county pair |
| `jobs_age_29_or_younger`, `jobs_age_30_to_54`, `jobs_age_55_or_older` | `SA01`, `SA02`, `SA03` | Age segment job counts |
| `jobs_earnings_1250_or_less`, `jobs_earnings_1251_to_3333`, `jobs_earnings_3333_plus` | `SE01`, `SE02`, `SE03` | Monthly earnings segment job counts |
| `flow_kind` | Derived | `within_target_county`, `between_target_counties`, `resident_work_destination`, or `worker_home_origin` |

Update frequency: The Census LEHD data page currently describes LODES8 data as available for most states for 2002-2023. The current configs use 2023 OD main all-jobs files whose sampled `createdate` values are `20251202`.

Usage restrictions:

- LODES is aggregate employment-flow data, not migration data and not a residential address source.
- Do not present LODES commute flows as proof that a person lives in or works in a county.
- Do not combine these metrics with individual profiles to infer personal movement, workplace, occupancy, or current residence.
- Keep the geography clear: the source rows are census-block OD rows, but this project stores only county-pair aggregates.

Assumptions:

- `JT00` all-jobs main OD files are the first implementation because they provide the broadest commute-flow signal.
- State OD files are workplace-state files. The Bay Area config covers California workplaces, NYC covers New York workplaces, and Greater Seattle covers Washington workplaces. A complete national outbound work-destination view for residents would require additional state files.
- County FIPS values are derived directly from the first five digits of the home and work census block geocodes.

Failure handling:

- Non-OK Census LEHD downloads fail with status and status text.
- Empty CSV files fail before import.
- Rows missing required `w_geocode`, `h_geocode`, or `S000` fields fail with explicit errors.
- Malformed home/work geocodes fail with explicit errors.
- Suppressed or nonnumeric optional segment values are stored as `null`; invalid total job counts fail.

## U.S. Census PEP County Components of Change

Origin: U.S. Census Bureau Population Estimates Program (PEP), County Population Totals and Components of Change.

Adapter: `lib/sources/census-pep-components.ts`

CLI:

```bash
npx tsx scripts/ingest-census-pep-components.ts -- --config=configs/mobility-sources/census-pep-2025-bay-area.json
npx tsx scripts/ingest-census-pep-components.ts -- --config=configs/mobility-sources/census-pep-2025-nyc.json
npx tsx scripts/ingest-census-pep-components.ts -- --config=configs/mobility-sources/census-pep-2025-greater-seattle.json
```

Current configs:

| Config | Coverage | Years |
| --- | --- | --- |
| `configs/mobility-sources/census-pep-2025-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | 2021-2025 |
| `configs/mobility-sources/census-pep-2025-nyc.json` | Bronx, Kings, New York, Queens, Richmond | 2021-2025 |
| `configs/mobility-sources/census-pep-2025-greater-seattle.json` | King, Pierce, Snohomish | 2021-2025 |

Stored fields:

| Stored field | Census field pattern | Meaning |
| --- | --- | --- |
| `population_estimate` | `POPESTIMATE{year}` | Annual resident population estimate |
| `net_population_change` | `NPOPCHG{year}` | Annual net population change |
| `births`, `deaths`, `natural_change` | `BIRTHS{year}`, `DEATHS{year}`, `NATURALCHG{year}` | Natural components of change |
| `international_migration` | `INTERNATIONALMIG{year}` | Net international migration component |
| `domestic_migration` | `DOMESTICMIG{year}` | Net domestic migration component |
| `net_migration` | `NETMIG{year}` | Net migration component |
| `residual` | `RESIDUAL{year}` | Residual population-change component |
| `domestic_migration_rate`, `international_migration_rate`, `net_migration_rate` | `RDOMESTICMIG{year}`, `RINTERNATIONALMIG{year}`, `RNETMIG{year}` | Annual rates of migration components |

Update frequency: PEP county totals and components are released annually. The current configs use Vintage 2025, covering April 1, 2020 to July 1, 2025.

Usage restrictions:

- Use these metrics as aggregate county-level population change context.
- Do not present PEP components as observed moves by specific people or households.
- Do not combine these metrics with individual profiles to infer personal movement, occupancy, or current residence.

Assumptions:

- PEP components complement ACS and IRS sources by providing annual net migration components, not pairwise origin/destination flows.
- The adapter imports county rows only (`SUMLEV = 050`) and expands configured years into stable county-year metrics.
- Rates are stored as supplied by Census and should be labeled as PEP component rates.

Failure handling:

- Non-OK Census downloads fail with status and status text.
- Empty CSV files fail before import.
- Rows missing required year-specific fields fail with explicit errors.
- Suppressed or nonnumeric values are stored as `null`.
