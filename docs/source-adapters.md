# Source Adapter Workflow

This project does not scrape arbitrary public-record websites. Every source adapter must start from an approved source configuration.

## Approved Collection Paths

1. Official bulk file.
2. Official API.
3. Records-request export.
4. Licensed provider file.
5. HTML collection only when automated access and reuse are explicitly allowed.

## Real Property Source Candidates

Configs for actual official county/state parcel and property sources live under `configs/property-sources/`. Importable ArcGIS/Socrata configs contain real endpoints and validated field maps; reference and licensed-provider configs document source-discovery paths that are not directly importable by current ingesters.

Run:

```bash
npm run sources:validate-property
```

The validator checks live Socrata or ArcGIS metadata and confirms that every mapped field exists before ingestion is attempted. It also validates reference-source URLs where possible. See `docs/property-source-candidates.md` for the current registry and operational checklist.

For sparse ArcGIS parcel layers, pass an explicit source filter when sampling so the first page contains usable person-bearing rows:

```bash
npm run ingest:arcgis -- --config=configs/property-sources/mt-cadastral-parcels.arcgis.json --where="OwnerName IS NOT NULL AND OwnerCity IS NOT NULL AND OwnerState IS NOT NULL" --limit=200
```

## Reference-Only Broker Coverage Lists

Reference configs under `configs/reference-sources/` document source-discovery or opt-out planning inputs that are not approved for person-profile ingestion. They must not be used to scrape people-search brokers, private datasets, or broker-derived personal information.

The Incogni broker coverage list is tracked as `configs/reference-sources/incogni-data-broker-coverage.reference.json` for opt-out/suppression planning only. It has no adapter or loader, and no adapter should be added unless legal/product review approves a licensed or permissioned broker-registry use case that stores only broker metadata.

## Aggregate Census ACS Mobility Adapter

The Census ACS mobility adapter imports aggregate county-level "Residence 1 year ago" estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP02` table group. This source supports privacy-compliant mobility analysis for major tech hubs without importing names, addresses, device signals, or household-level records.

Configs live in `configs/mobility-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-mobility.ts -- --config=configs/mobility-sources/census-acs-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate geography-level trends.
- Do not join these metrics to individual profiles to infer personal movement, occupancy, or current residence.
- Display source year and geography because ACS values are estimates for a five-year period.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate IRS SOI Migration Adapter

The IRS SOI migration adapter imports aggregate county-to-county migration inflow and outflow files from the IRS Statistics of Income migration dataset. It stores counts of tax returns, individuals, and aggregate adjusted gross income by origin/destination county for configured tech-hub counties.

Configs live in `configs/mobility-sources/`.

Run:

```bash
npx tsx scripts/ingest-irs-soi-migration.ts -- --config=configs/mobility-sources/irs-soi-2022-2023-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level movement analysis.
- Do not treat IRS migration files as complete resident counts; they reflect tax-return address changes.
- Do not join these flows to individual profiles to infer personal movement, occupancy, or current residence.
- Preserve direction labels because inflow and outflow files use different origin/destination columns.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Migration Flow Adapter

The ACS migration-flow adapter imports aggregate county migration estimates from the U.S. Census Bureau ACS migration-flow API. It complements IRS SOI flows because it estimates people moving between counties rather than tax-return address changes.

Configs live in `configs/mobility-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-migration-flows.ts -- --config=configs/mobility-sources/census-acs-flows-2022-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level movement analysis.
- Treat values as ACS survey estimates with suppression and margins of error.
- Do not join these flows to individual profiles to infer personal movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Residential Tenure Adapter

The ACS residential tenure adapter imports aggregate county-level "year householder moved into unit" estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP04` table group. It helps distinguish recently moved households from long-tenured households at an aggregate geography level.

Configs live in `configs/mobility-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-residential-tenure.ts -- --config=configs/mobility-sources/census-acs-residential-tenure-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate residential-tenure context.
- Do not treat county tenure buckets as evidence about any person's residence history or current address.
- Do not join these metrics to individual profiles to infer personal movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Commuting Adapter

The ACS commuting adapter imports aggregate county-level commuting mode, work-from-home, and mean travel-time estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP03` table group.

Configs live in `configs/mobility-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-commuting.ts -- --config=configs/mobility-sources/census-acs-commuting-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate commuting-pattern context.
- Do not treat county commute estimates as evidence about any person's residence, workplace, or travel behavior.
- Do not join these metrics to individual profiles to infer personal movement, workplace, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Household Income Adapter

The ACS household income adapter imports aggregate county-level household income distribution estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP03` table group. It stores the original household-income buckets, median and mean household income, plus derived under-$50k, $100k-plus, and $150k-plus household rollups.

Configs live in `configs/economic-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-household-income.ts -- --config=configs/economic-sources/census-acs-household-income-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level economic context.
- Do not treat county income estimates as evidence about any specific person, employer, household, address, income, asset, tax record, or wealth level.
- Do not join these metrics to individual profiles to infer income, employment, wealth, residence, occupancy, or household finances.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Educational Attainment Adapter

The ACS educational attainment adapter imports aggregate county-level educational attainment estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP02` table group. It stores only county-level counts and percentages for population age 25 and over.

Configs live in `configs/economic-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-educational-attainment.ts -- --config=configs/economic-sources/census-acs-educational-attainment-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level economic and demographic context.
- Do not treat county educational-attainment estimates as evidence about any specific person, household, address, degree, school record, employment status, income, benefit status, eligibility, or wealth level.
- Do not join these metrics to individual profiles to infer education, income, employment, wealth, residence, occupancy, or household finances.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate BLS LAUS County Labor Adapter

The BLS LAUS county labor adapter imports aggregate county-month labor force, employment, unemployment, and unemployment-rate estimates from the U.S. Bureau of Labor Statistics Local Area Unemployment Statistics API. It stores county-level monthly metrics only.

Configs live in `configs/economic-sources/`.

Run:

```bash
npx tsx scripts/ingest-bls-laus-county-labor.ts -- --config=configs/economic-sources/bls-laus-county-labor-2024-2026-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level labor-market context.
- Do not treat county labor metrics as evidence about any specific person, household, address, employer, job, income, unemployment status, benefit status, or eligibility.
- Do not join these metrics to individual profiles to infer employment, unemployment, income, wealth, residence, employer, or household finances.
- A BLS registration key is optional; set `BLS_API_KEY` to include one in API requests.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census County Business Patterns Adapter

The Census CBP county business adapter imports aggregate county-year all-sector establishment, employment, and annual payroll metrics from the U.S. Census County Business Patterns API. It stores only county-level business totals for configured counties.

Configs live in `configs/economic-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-cbp-county-business.ts -- --config=configs/economic-sources/census-cbp-county-business-2023-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level business and labor-market context.
- Do not treat county business totals as evidence about any specific person, household, address, employer, job, income, payroll, tax record, benefit status, or eligibility.
- Do not join these metrics to individual profiles to infer employment, income, wealth, residence, employer, or household finances.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Age And Sex Adapter

The ACS age and sex adapter imports aggregate county-level age and sex distribution estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP05` table group. It stores only county-level counts, percentages, sex ratio, and median age.

Configs live in `configs/social-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-age-sex.ts -- --config=configs/social-sources/census-acs-age-sex-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level demographic context.
- Do not treat county age or sex estimates as evidence about any specific person, household, address, birth date, identity attribute, benefit status, or eligibility.
- Do not join these metrics to individual profiles to infer age, sex, residence, household composition, identity attributes, income, or eligibility.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-social-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Race And Origin Adapter

The ACS race and origin adapter imports aggregate county-level broad race and Hispanic or Latino origin estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP05` table group. It stores only county-level counts and percentages for broad categories, not detailed ancestry subgroup rows.

Configs live in `configs/social-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-race-origin.ts -- --config=configs/social-sources/census-acs-race-origin-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level demographic context.
- Do not treat county race or origin estimates as evidence about any specific person, household, address, protected-class attribute, national origin, identity attribute, benefit status, or eligibility.
- Do not join these metrics to individual profiles to infer race, ethnicity, national origin, residence, household composition, identity attributes, income, or eligibility.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-social-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Internet Access Adapter

The ACS internet access adapter imports aggregate county-level household computer and broadband subscription estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP02` table group. It stores only county-level counts and percentages.

Configs live in `configs/social-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-internet-access.ts -- --config=configs/social-sources/census-acs-internet-access-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level social and digital-access context.
- Do not treat county computer or broadband access estimates as evidence about any specific person, household, address, device, subscription, IP address, income, benefit status, or eligibility.
- Do not join these metrics to individual profiles to infer device ownership, internet service, residence, household composition, income, or eligibility.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-social-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Language Proficiency Adapter

The ACS language proficiency adapter imports aggregate county-level language spoken at home and English-proficiency estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP02` table group. It stores only county-level counts and percentages for residents age 5 and over.

Configs live in `configs/social-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-language-proficiency.ts -- --config=configs/social-sources/census-acs-language-proficiency-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level social context.
- Do not treat county language or English-proficiency estimates as evidence about any specific person, household, address, language, national origin, immigration status, education, employment, benefit status, or eligibility.
- Do not join these metrics to individual profiles to infer language, origin, immigration status, residence, household composition, income, or eligibility.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-social-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Employment Status Adapter

The ACS employment status adapter imports aggregate county-level employment-status estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP03` table group. It stores only county-level counts, percentages, and unemployment rate.

Configs live in `configs/economic-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-employment-status.ts -- --config=configs/economic-sources/census-acs-employment-status-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level economic context.
- Do not treat county employment estimates as evidence about any specific person, household, address, employer, job, income, benefit status, eligibility, or wealth level.
- Do not join these metrics to individual profiles to infer employment, income, wealth, residence, occupancy, or household finances.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Health Insurance Adapter

The ACS health insurance adapter imports aggregate county-level health-insurance coverage estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP03` table group. It stores only county-level coverage counts and percentages.

Configs live in `configs/economic-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-health-insurance.ts -- --config=configs/economic-sources/census-acs-health-insurance-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level economic and coverage context.
- Do not treat county insurance estimates as evidence about any specific person, household, address, medical condition, insurance status, claim, income, benefit status, eligibility, or wealth level.
- Do not join these metrics to individual profiles to infer health coverage, medical status, income, employment, wealth, residence, occupancy, or household finances.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Poverty and Assistance Adapter

The ACS poverty and assistance adapter imports aggregate county-level poverty, cash public assistance, and Food Stamp/SNAP estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP03` table group. It stores only county-level counts and percentages.

Configs live in `configs/economic-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-poverty-assistance.ts -- --config=configs/economic-sources/census-acs-poverty-assistance-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level economic context.
- Do not treat county poverty or assistance estimates as evidence about any specific person, household, address, income, benefit status, eligibility, asset, tax record, or wealth level.
- Do not join these metrics to individual profiles to infer poverty status, public benefits, income, employment, wealth, residence, occupancy, or household finances.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate HUD Low/Moderate Income Block Group Adapter

The HUD low/moderate income block group adapter imports official HUD open-data block-group counts and rolls them up to configured county-level metrics. It stores only aggregate counts, a weighted low/moderate income share, and block-group counts for the configured counties.

Configs live in `configs/economic-sources/`.

Run:

```bash
npx tsx scripts/ingest-hud-low-moderate-income-block-groups.ts -- --config=configs/economic-sources/hud-low-mod-income-bg-2020-bay-area.json
```

Important constraints:

- Use this source only for aggregate economic and community-development context.
- Do not treat block-group or county low/moderate income metrics as evidence about any specific person, household, address, income, benefit status, residence, eligibility, asset, tax record, or wealth level.
- Do not join these metrics to individual profiles to infer income, employment, wealth, residence, occupancy, or household finances.
- Do not request geometry, names, addresses, tenants, owners, contacts, property records, devices, household-level rows, or parcel records.

See `docs/aggregate-economic-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate HUD Housing Choice Voucher Adapter

The HUD Housing Choice Voucher adapter imports official HUD open-data metrics
for Housing Choice Voucher counts aggregated to 2020 Census tracts. It stores
only tract-level voucher counts and percentages for configured counties.

Configs live in `configs/housing-assistance-sources/`.

Run:

```bash
npx tsx scripts/ingest-hud-housing-choice-vouchers.ts -- --config=configs/housing-assistance-sources/hud-hcv-2025-bay-area.json
npx tsx scripts/ingest-hud-public-housing-buildings.ts -- --config=configs/housing-assistance-sources/hud-public-housing-buildings-2025-bay-area.json
npx tsx scripts/ingest-hud-lihtc-properties.ts -- --config=configs/housing-assistance-sources/hud-lihtc-properties-bay-area.json
npx tsx scripts/ingest-hud-qualified-census-tracts.ts -- --config=configs/housing-assistance-sources/hud-qct-2026-bay-area.json
npx tsx scripts/ingest-hud-difficult-development-areas.ts -- --config=configs/housing-assistance-sources/hud-dda-2026-bay-area.json
npx tsx scripts/ingest-hud-small-area-fair-market-rents.ts -- --config=configs/housing-assistance-sources/hud-safmr-2026-bay-area.json
npx tsx scripts/ingest-hud-fair-market-rents.ts -- --config=configs/housing-assistance-sources/hud-fmr-2026-bay-area.json
```

Important constraints:

- Use this source only for aggregate housing-assistance context.
- Do not treat voucher counts as evidence about any person's benefit status,
  residence, income, disability, household, landlord, or exact address.
- Do not join these metrics to individual profiles.
- Do not request geometry, participant names, owners, addresses, agency contacts,
  lat/lon, project names, building names, resident demographic fields, or
  household-level rows.
- For LIHTC properties, do not request project names, project addresses, contact
  names, company names, company addresses, phone numbers, standardized
  addresses, geometry, lat/lon, or block-level geocoding fields.
- For Qualified Census Tracts, store county-level tract counts only. Do not use
  QCT status as evidence of any specific person's residence, income,
  eligibility, household status, benefit status, or exact address.
- For Difficult Development Areas, store HUD FMR/MSA aggregate ZCTA counts only.
  Do not use DDA status as evidence of any specific person's residence, income,
  eligibility, household status, benefit status, or exact address.
- For Small Area Fair Market Rents, store official HUD ZIP/ZCTA rent and payment
  standard values only. Do not use SAFMR values as evidence of any specific
  person's rent, benefit status, residence, occupancy, or exact address.
- For Fair Market Rents, store official HUD FMR/MSA area rent values only. Do
  not use FMR values as evidence of any specific person's rent, benefit status,
  residence, occupancy, or exact address.

See `docs/aggregate-housing-assistance-sources.md` for coverage, fields, update
cadence, assumptions, and failure handling.

## Aggregate Census LEHD LODES Commute Flow Adapter

The Census LEHD LODES adapter imports official Origin-Destination Employment Statistics OD files and aggregates census-block home/work rows into county-pair commute flows for configured tech-hub counties. It stores aggregate job counts only, including optional age and earnings segment totals supplied by LODES.

Configs live in `configs/mobility-sources/`.

Run:

```bash
npx tsx scripts/ingest-census-lehd-lodes.ts -- --config=configs/mobility-sources/census-lehd-lodes-2023-bay-area.json
```

Important constraints:

- Use this source only for aggregate residence-work flow context.
- Do not treat commute flows as migration, current residence proof, or individual employment evidence.
- Do not join these metrics to individual profiles to infer personal movement, workplace, occupancy, or current residence.
- Preserve year, job type, and workplace-state source file labels because each OD file is state-based.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census PEP Components Adapter

The Census PEP components adapter imports annual county population totals and components of population change from the Census Population Estimates Program bulk CSV. It adds annual net domestic migration, international migration, and net migration context for target tech hubs.

Configs live in `configs/mobility-sources/`.

Run:

```bash
npx tsx scripts/ingest-census-pep-components.ts -- --config=configs/mobility-sources/census-pep-2025-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level population-change analysis.
- Do not treat PEP components as observed movements by specific people or households.
- Do not join these metrics to individual profiles to infer personal movement, occupancy, or current residence.
- Preserve year and vintage labels because estimates are revised by later vintages.

See `docs/aggregate-mobility-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Socrata Housing Permit Adapter

The Socrata housing permit adapter imports non-personal permit fields from official Socrata datasets and stores monthly aggregate permit metrics. It is intended as housing-supply context for residential mobility analysis, not as person-level evidence.

Configs live in `configs/housing-permit-sources/`.

Run:

```bash
npx tsx scripts/ingest-socrata-housing-permits.ts -- --config=configs/housing-permit-sources/seattle-issued-building-permits.json
```

Important constraints:

- Select only non-personal fields needed for aggregation.
- Do not request or store owner, applicant, contractor, phone, address, coordinate, or document-link fields.
- Do not join permit-level records to individual profiles.
- Treat unit-count semantics as source-specific and preserve config notes.

See `docs/aggregate-housing-permit-sources.md` for origin, coverage, selected fields, update assumptions, usage restrictions, and failure handling.

## Aggregate HUD Residential Construction Permits Adapter

The HUD residential construction permits adapter imports annual county residential construction permit totals from HUD's open ArcGIS layer derived from the U.S. Census Building Permits Survey. It stores aggregate county-year totals for all residential permits, single-family permits, and multifamily permits.

Configs live in `configs/housing-permit-sources/`.

Run:

```bash
npx tsx scripts/ingest-hud-residential-construction-permits.ts -- --config=configs/housing-permit-sources/hud-bps-2022-bay-area.json
```

Important constraints:

- Use this source only for aggregate county-level housing-supply context.
- Do not treat county permit counts as evidence about any person, household, or exact address.
- Do not join these metrics to individual profiles to infer personal movement, occupancy, or current residence.
- Preserve year and county FIPS labels because the layer is annual county data, not permit-level records.

See `docs/aggregate-housing-permit-sources.md` for origin, coverage, selected fields, update assumptions, usage restrictions, and failure handling.

## Aggregate Census ACS Housing Stock Adapter

The ACS housing stock adapter imports aggregate county-level housing units, occupancy, vacancy, tenure, median home value, and median gross rent from the U.S. Census Bureau ACS 5-year Data Profile `DP04` table group.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts -- --config=configs/housing-stock-sources/census-acs-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate geography-level housing context.
- Do not treat county housing estimates as evidence about any person, household, or exact address.
- Do not join these metrics to individual profiles to infer personal movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Housing Structure Adapter

The ACS housing structure adapter imports aggregate county-level units-in-structure and year-built estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP04` table group. It stores original Census buckets and derived single-family, multifamily, newer-stock, and older-stock rollups.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts-structure -- --config=configs/housing-stock-sources/census-acs-housing-structure-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate housing-stock context.
- Do not treat county structure or year-built estimates as evidence about any specific address, building, owner, household, occupancy state, or residence.
- Do not join these metrics to individual profiles to infer personal movement, exact housing type, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Household Composition Adapter

The ACS household composition adapter imports aggregate county-level household-type estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP02` table group. It stores living-alone, households-with-children, households-with-older-adults, and average household/family-size indicators.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-household-composition.ts -- --config=configs/housing-stock-sources/census-acs-household-composition-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate household-composition and residential-context analysis.
- Do not treat county household-composition estimates as evidence about any specific household, family, address, occupancy state, or residence.
- Do not join these metrics to individual profiles to infer family relationships, personal movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Value/Rent Adapter

The ACS value/rent adapter imports aggregate county-level owner-occupied home-value buckets and gross-rent buckets from the U.S. Census Bureau ACS 5-year Data Profile `DP04` table group. It stores the original Census buckets plus derived `value_500k_plus` and `rent_2500_plus` rollups for Bay Area housing-pressure analysis.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-value-rent.ts -- --config=configs/housing-stock-sources/census-acs-value-rent-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate housing-market context.
- Do not treat county value or rent estimates as evidence about any specific home, owner, renter, parcel, lease, sale, address, occupancy state, or residence.
- Do not join these metrics to individual profiles to infer wealth, rent, ownership, personal movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Housing Crowding Adapter

The ACS housing crowding adapter imports aggregate county-level occupants-per-room estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP04` table group. It stores the Census buckets and derives overcrowded and severe-overcrowded aggregate metrics.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts-crowding -- --config=configs/housing-stock-sources/census-acs-crowding-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate housing-pressure context.
- Do not treat county crowding estimates as evidence about any specific household, address, household size, occupancy state, or residence.
- Do not join these metrics to individual profiles to infer personal movement, household composition, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Vacancy Status Adapter

The ACS vacancy status adapter imports aggregate county-level vacant-unit composition from U.S. Census Bureau ACS 5-year detailed table `B25004`. It stores vacant units for rent, for sale, seasonal/recreational/occasional use, and other Census vacancy categories.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-vacancy-status.ts -- --config=configs/housing-stock-sources/census-acs-vacancy-status-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate housing availability and mobility-pressure context.
- Do not treat county vacancy-status estimates as evidence about any specific address, owner, household, or occupancy state.
- Do not join these metrics to individual profiles to infer personal movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Aggregate Census ACS Housing Cost Burden Adapter

The ACS housing cost burden adapter imports aggregate county-level owner and renter housing cost burden estimates from the U.S. Census Bureau ACS 5-year Data Profile `DP04` table group. It stores 30%+ cost-burden counts and percentages for mortgage owners, non-mortgage owners, and renters.

Configs live in `configs/housing-stock-sources/`.

Run:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts-cost-burden -- --config=configs/housing-stock-sources/census-acs-cost-burden-2024-bay-area.json
```

Important constraints:

- Use this source only for aggregate housing-affordability and mobility-pressure context.
- Do not treat county cost-burden estimates as evidence about any person's income, rent, mortgage, household, or exact address.
- Do not join these metrics to individual profiles to infer personal affordability, movement, occupancy, or current residence.
- Keep Census API keys out of committed configs and pass them through `CENSUS_API_KEY`.

See `docs/aggregate-housing-stock-sources.md` for coverage, fields, update cadence, assumptions, and failure handling.

## Local CSV Import

Use a CSV with these columns:

```csv
profile_id,source_record_id,full_name,birth_date,age_range,confidence,aliases,street,city,state,zip,location_kind,phones,emails,relationships
```

List fields use `|` or `;` separators.
`birth_date` is optional, must be an exact full date, and is used only for
identity matching with the same normalized name. Do not display exact dates of
birth publicly.

Run:

```bash
npm run ingest:csv -- data/imports/example.csv approved_source_id
```

## Approved Source Fetch

Create a JSON config:

```json
{
  "sourceId": "county_parcel_open_data",
  "approved": true,
  "method": "official_api",
  "url": "https://example.gov/resource/records.json",
  "extension": "json"
}
```

Run:

```bash
npm run collect:source -- configs/county-parcel.json
```

The script saves raw payloads under `data/raw/`, which is ignored by Git.

## Import Caps

Most API adapters do not send a small source-side result cap by default. The optional `--limit=n` flag is for bounded smoke runs or explicit import caps; omit it when you want the adapter to use the source's normal default response size. Full historical collection still requires source-specific pagination or bulk-file workflows.

## Automatic Name Search Refresh

Name searches run the built-in approved source adapters before rendering results unless a specific source has already been refreshed for the same hashed, normalized name-search payload within the last hour. This freshness check is per source, not based on how many local results already exist, so a strong local match does not prevent stale sources from being refreshed.

Operational notes:

- The source refresh log stores source IDs, hashed query keys, timestamps, status, and import counts; it does not store raw searched names.
- Override the default one-hour source freshness window with `NAME_SOURCE_REFRESH_TTL_SECONDS`.
- Override the default 15-second per-source timeout with `NAME_SOURCE_REFRESH_TIMEOUT_SECONDS`.
- Configuration-driven open-data adapters such as Socrata, ArcGIS, CKAN, and Opendatasoft still require an approved source config before ingestion.
- Source failures are recorded for the source/query pair so repeated page loads do not hammer unavailable APIs.

## Socrata/SODA Open Data Adapter

The Socrata adapter ingests approved open-data portal rows from official SODA API datasets. It is intended for source-specific public-record datasets such as assessor, parcel, or address datasets only after the jurisdiction's terms allow automated access, commercial reuse, republication, and combination with other approved sources.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_parcel_socrata",
  "sourceName": "County Parcel Open Data",
  "jurisdiction": "Example County, ST",
  "domain": "data.example.gov",
  "datasetId": "abcd-1234",
  "licenseUrl": "https://data.example.gov/terms",
  "fields": {
    "recordId": "parcel_id",
    "name": "owner_name",
    "street": "situs_address",
    "city": "situs_city",
    "state": "situs_state",
    "zip": "situs_zip",
    "updatedAt": "last_modified"
  }
}
```

Run:

```bash
npm run ingest:socrata -- --config=configs/county-parcel-socrata.json --query="Jane Smith"
```

Important constraints:

- Use only official Socrata/SODA endpoints from approved jurisdictions.
- Do not use this adapter to track a person's movements, infer occupancy, or publish exact residential history without legal and safety approval.
- Map only approved columns. Exclude protected-address records, confidential owners, minors, shelters, and safety-sensitive facilities.
- Treat property ownership, mailing, and situs addresses as public-record context, not proof of current residence.

Source documentation:

- Socrata SODA API: https://dev.socrata.com/
- Socrata API querying: https://dev.socrata.com/docs/queries/

## ArcGIS FeatureServer Adapter

The ArcGIS adapter ingests approved feature attributes from official ArcGIS REST FeatureServer layers. Many county assessor, parcel, address, and GIS open-data portals expose records through this format.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_parcel_arcgis",
  "sourceName": "County Parcel Feature Layer",
  "jurisdiction": "Example County, ST",
  "layerUrl": "https://services.example.gov/arcgis/rest/services/Parcels/FeatureServer/0",
  "licenseUrl": "https://example.gov/open-data-license",
  "fields": {
    "recordId": "PARCEL_ID",
    "name": "OWNER_NAME",
    "street": "SITUS_ADDR",
    "city": "SITUS_CITY",
    "state": "SITUS_STATE",
    "zip": "SITUS_ZIP",
    "updatedAt": "EDIT_DATE"
  }
}
```

Run:

```bash
npm run ingest:arcgis -- --config=configs/county-parcel-arcgis.json --query="Jane Smith"
```

Important constraints:

- Use only official ArcGIS layers where automated query and reuse are allowed.
- Prefer owner/parcel index fields over full document images or unreviewed attachments.
- Do not use this adapter to track a person's movements, infer current occupancy, or expose protected addresses.
- Respect layer `maxRecordCount`; full collection needs source-specific pagination by object IDs or offsets.

Source documentation:

- ArcGIS REST Query operation: https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
- ArcGIS Feature services: https://developers.arcgis.com/rest/services-reference/enterprise/feature-service/

## CKAN DataStore Adapter

The CKAN adapter ingests approved records from official CKAN DataStore resources. CKAN is commonly used by national, state, county, municipal, and university open-data portals. Use it for public-record resources only after confirming the exact resource license permits automated access, commercial reuse, republication, and combination with other approved sources.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_parcel_ckan",
  "sourceName": "County Parcel CKAN Resource",
  "jurisdiction": "Example County, ST",
  "portalUrl": "https://data.example.gov",
  "resourceId": "00000000-0000-0000-0000-000000000000",
  "licenseUrl": "https://data.example.gov/license",
  "fields": {
    "recordId": "parcel_number",
    "name": "owner",
    "street": "property_address",
    "city": "property_city",
    "state": "property_state",
    "zip": "property_zip",
    "updatedAt": "updated"
  }
}
```

Run:

```bash
npm run ingest:ckan -- --config=configs/county-parcel-ckan.json --query="Jane Smith"
```

Important constraints:

- Use only official CKAN/DataStore resources where automated access and reuse are allowed.
- Do not treat parcel ownership, mailing address, or property address as proof of current residence.
- Do not use CKAN data to track a person's movements, publish a timeline of address changes, or expose protected addresses.
- Map only approved columns and exclude safety-sensitive fields, confidential owner records, shelters, protected-person records, and minors.

Source documentation:

- CKAN DataStore extension: https://docs.ckan.org/en/latest/maintaining/datastore.html
- CKAN API guide: https://docs.ckan.org/en/latest/api/

## Opendatasoft Explore API Adapter

The Opendatasoft adapter ingests approved records from official Opendatasoft/Huwise Explore API datasets. Many government and public-sector open-data portals use this platform for property, parcel, address, permit, and registry datasets. Use it only after confirming the exact portal and dataset terms permit automated access, commercial reuse, republication, and combination with other approved sources.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_parcel_opendatasoft",
  "sourceName": "County Parcel Opendatasoft Dataset",
  "jurisdiction": "Example County, ST",
  "domain": "data.example.gov",
  "datasetId": "parcels",
  "licenseUrl": "https://data.example.gov/terms",
  "fields": {
    "recordId": "parcel_id",
    "name": "owner_name",
    "street": "site_address",
    "city": "site_city",
    "state": "site_state",
    "zip": "site_zip",
    "updatedAt": "record_updated"
  }
}
```

Run:

```bash
npm run ingest:opendatasoft -- --config=configs/county-parcel-opendatasoft.json --query="Jane Smith"
```

Important constraints:

- Use only official Opendatasoft datasets where automated access and reuse are allowed.
- Do not treat owner, parcel, mailing, or situs address fields as proof of current residence.
- Do not use Opendatasoft data to track a person's movements, publish address timelines, or expose protected addresses.
- Map only approved columns and exclude protected-person records, confidential owner records, shelters, sensitive facilities, and minors.
- Keep any API key in local config or environment-specific secrets; logs redact the `apikey` query parameter.

Source documentation:

- Opendatasoft Explore API v2: https://help.opendatasoft.com/apis/ods-explore-v2/
- Opendatasoft API guide: https://help.opendatasoft.com/apis/

## Custom Official JSON API Adapter

The official JSON adapter ingests approved records from official agency JSON endpoints that do not use Socrata, ArcGIS, CKAN, or Opendatasoft. Use it for custom county, city, assessor, parcel, property, or address APIs only after documenting the endpoint owner, terms, allowed fields, and reuse permissions.

The adapter can read a top-level JSON array or a nested array selected with `recordsPath`. Field mappings support dotted paths such as `owner.name` and `site.city`.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_parcel_json",
  "sourceName": "County Parcel Custom JSON API",
  "jurisdiction": "Example County, ST",
  "url": "https://example.gov/api/parcels",
  "recordsPath": "data.records",
  "queryParam": "owner",
  "limitParam": "limit",
  "licenseUrl": "https://example.gov/open-data-terms",
  "fields": {
    "recordId": "parcel.id",
    "name": "owner.name",
    "street": "site.street",
    "city": "site.city",
    "state": "site.state",
    "zip": "site.zip",
    "updatedAt": "meta.updated"
  }
}
```

Run:

```bash
npm run ingest:official-json -- --config=configs/county-parcel-json.json --query="Jane Smith"
```

Important constraints:

- Use only official JSON endpoints where automated access and reuse are explicitly allowed.
- Do not use custom JSON data to track a person's movements, infer current occupancy, or publish address timelines.
- Map only approved fields and exclude protected-person records, confidential owner records, shelters, sensitive facilities, minors, and any field marked private, redacted, sealed, or restricted.
- Prefer stable parcel or record IDs for `recordId`; do not derive source IDs from names or addresses alone.
- Keep credentials and API keys out of committed configs.

## Official Delimited Bulk File Adapter

The official delimited adapter ingests approved CSV, TSV, pipe-delimited, or semicolon-delimited bulk files from official agency URLs. This covers many county assessor, property tax roll, parcel, and address datasets that are distributed as downloadable files rather than APIs.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_bulk_parcels",
  "sourceName": "County Parcel Bulk CSV",
  "jurisdiction": "Example County, ST",
  "url": "https://example.gov/downloads/parcels.csv",
  "delimiter": ",",
  "licenseUrl": "https://example.gov/open-data-terms",
  "fields": {
    "recordId": "parcel_id",
    "name": "owner_name",
    "street": "site_address",
    "city": "site_city",
    "state": "site_state",
    "zip": "site_zip",
    "updatedAt": "last_update"
  }
}
```

Run:

```bash
npm run ingest:official-delimited -- --config=configs/county-parcel-csv.json --query="Jane Smith"
```

Important constraints:

- Use only official bulk files where automated download, commercial reuse, republication, and combination are allowed.
- Do not use bulk property rows to track a person's movements, infer current occupancy, or publish address timelines.
- Map only approved columns and exclude protected-person records, confidential owner records, shelters, sensitive facilities, minors, and fields marked redacted, sealed, private, or restricted.
- Prefer stable parcel, account, or record IDs for `recordId`; do not derive IDs from names or addresses alone.
- Large full-history imports should use source-specific checkpointing, row-count validation, and schema-change checks before production use.

## Official XML API / Feed Adapter

The official XML adapter ingests approved XML endpoints from official agency systems that do not publish JSON, Socrata, ArcGIS, CKAN, Opendatasoft, or delimited files. This covers legacy assessor, recorder, parcel, tax, and municipal feeds where XML is the only machine-readable format.

The adapter reads records from a configured XML path and maps configured dotted fields into local profiles. XML attributes are available with the `@_` prefix, for example `record.@_id`.

Create a config file:

```json
{
  "approved": true,
  "sourceId": "county_parcel_xml",
  "sourceName": "County Parcel XML Feed",
  "jurisdiction": "Example County, ST",
  "url": "https://example.gov/api/parcels.xml",
  "recordsPath": "response.records.record",
  "queryParam": "owner",
  "limitParam": "limit",
  "licenseUrl": "https://example.gov/open-data-terms",
  "fields": {
    "recordId": "parcel.id",
    "name": "owner.name",
    "street": "site.street",
    "city": "site.city",
    "state": "site.state",
    "zip": "site.zip",
    "updatedAt": "meta.updated"
  }
}
```

Run:

```bash
npm run ingest:official-xml -- --config=configs/county-parcel-xml.json --query="Jane Smith"
```

Important constraints:

- Use only official XML endpoints where automated access, commercial reuse, republication, and combination are allowed.
- Do not use XML records to track a person's movements, infer current occupancy, or publish address timelines.
- Map only approved fields and exclude protected-person records, confidential owner records, shelters, sensitive facilities, minors, and fields marked redacted, sealed, private, or restricted.
- Prefer stable parcel, account, or record IDs for `recordId`; do not derive IDs from names or addresses alone.
- Treat XML schemas as unstable unless the agency publishes a schema/version contract; validate row counts and required fields before production imports.

## CMS NPPES NPI Registry Adapter

The NPPES adapter uses the official CMS NPI Registry API to ingest limited active individual provider records. It maps professional/business addresses and phone numbers into local profiles with raw NPI records stored as provenance.

Run:

```bash
npm run ingest:nppes -- --last=Smith --first=John --state=CA
```

Or fetch by NPI:

```bash
npm run ingest:nppes -- --npi=1234567890
```

Important constraints:

- Use this as professional/provider directory data, not residential people-search data.
- The adapter only imports active individual providers (`NPI-1`, status `A`).
- NPPES data remains governed by CMS/NPPES publication rules; local opt-out suppression only controls whether this app republishes a profile.

Source documentation:

- CMS NPPES API: https://npiregistry.cms.hhs.gov/api-page
- CMS data dissemination notes: https://www.cms.gov/medicare/regulations-guidance/administrative-simplification/data-dissemination

## FEC OpenFEC Candidate Adapter

The FEC adapter uses the official OpenFEC candidate search API to ingest federal candidate records. It maps candidate name, party, office, state, and active cycle into civic/candidate context profiles.

Run:

```bash
npm run ingest:fec -- --query="Smith"
```

By default, the script uses `FEC_API_KEY` if present and falls back to `DEMO_KEY` for local experiments. Use a real API key for sustained work:

```bash
FEC_API_KEY=your_key npm run ingest:fec -- --query="Jane Smith"
```

Important constraints:

- Use this as federal campaign/candidate context, not residential contact data.
- Do not ingest individual contribution records into general public profiles without separate legal and product review.
- Do not use this data for employment, tenant screening, credit, insurance, or eligibility decisions.

Source documentation:

- OpenFEC developers: https://api.open.fec.gov/developers/
- FEC campaign finance data: https://www.fec.gov/data/

## FederalRegister.gov Document Mention Adapter

The Federal Register adapter uses the official FederalRegister.gov API to ingest limited public-document mentions for a searched name or term. It creates low-confidence public-document context profiles that identify the document title, publication date, and agency.

Run:

```bash
npm run ingest:federal-register -- --query="Jane Smith"
```

Important constraints:

- Use this as public-document mention context only.
- A document search hit is not identity evidence, contact evidence, or residential data.
- FederalRegister.gov notes that its site is an informational XML rendition and users should verify against official editions where legal notice matters.

Source documentation:

- FederalRegister.gov API docs: https://www.federalregister.gov/developers/documentation/api/v1

## OpenAlex Authors Adapter

The OpenAlex adapter uses the official OpenAlex Authors API to ingest scholarly author profiles. It maps author display name, ORCID, work counts, citation counts, and last known institution into scholarly/professional context profiles.

Run:

```bash
npm run ingest:openalex -- --query="Jane Smith"
```

Important constraints:

- Use this as scholarly author context only.
- Do not treat an OpenAlex author record as residential contact data or legal identity verification.
- Institution fields represent scholarly affiliation context and may be outdated or ambiguous.

Source documentation:

- OpenAlex developer docs: https://developers.openalex.org/
- OpenAlex Authors overview: https://developers.openalex.org/api-reference/authors
- OpenAlex search guide: https://developers.openalex.org/guides/searching

## Wikidata Entity Adapter

The Wikidata adapter uses the official Wikidata MediaWiki Action API `wbsearchentities` endpoint to ingest public-knowledge entity search hits. It maps entity label, description, and entity URI into low-confidence public-knowledge context profiles.

Run:

```bash
npm run ingest:wikidata -- --query="Jane Smith"
```

Important constraints:

- Use this as public-knowledge context only.
- Wikidata entity search hits are not contact evidence, residential evidence, or identity-verification evidence.
- Labels are not unique; descriptions and entity IDs must be shown internally for disambiguation.
- Wikidata is collaboratively edited, so production display should link to provenance and allow reporting of incorrect matches.

Source documentation:

- Wikidata data access: https://www.wikidata.org/wiki/Wikidata:Data_access
- Wikidata REST API overview: https://www.wikidata.org/wiki/Wikidata:REST_API
- Wikidata introduction: https://www.wikidata.org/wiki/Wikidata:Introduction

## Crossref Works Adapter

The Crossref adapter uses the official Crossref REST API to ingest scholarly work author mentions. It queries works by author name, then imports only authors whose displayed given/family name contains every query token.

Run:

```bash
npm run ingest:crossref -- --query="Jane Smith"
```

Crossref recommends adding contact information. The script adds a `mailto` query parameter and User-Agent; you can override the email:

```bash
npm run ingest:crossref -- --query="Jane Smith" --mailto=you@example.com
```

Important constraints:

- Use this as scholarly publication author context only.
- Crossref author matching can be noisy; do not treat a work hit as identity verification.
- Do not display Crossref data as residential, contact, employment, or eligibility-screening evidence.
- Cache and rate-limit production usage according to Crossref etiquette.

Source documentation:

- Crossref REST API docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- Crossref access and authentication: https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/

## ClinicalTrials.gov Study Personnel Adapter

The ClinicalTrials.gov adapter uses the official v2 Studies API to ingest public clinical study personnel. It searches studies by term, then imports only central contacts, overall officials, or location contacts whose name contains every query token.

Run:

```bash
npm run ingest:clinical-trials -- --query="Jane Smith"
```

Important constraints:

- Use this as clinical research context only.
- Study personnel names, roles, business phones, and business emails may be public for trial coordination, but they are not residential data.
- A broad study search can match study text rather than a person; the adapter filters names before import, but production display should still show low/medium confidence and source provenance.
- Do not use this data for employment, tenant screening, credit, insurance, eligibility decisions, or medical inference about the person.

Source documentation:

- ClinicalTrials.gov API: https://clinicaltrials.gov/data-api/api
- ClinicalTrials.gov Data and API overview: https://clinicaltrials.gov/data-api
- ClinicalTrials.gov study data structure: https://clinicaltrials.gov/data-api/about-api/study-data-structure

## DataCite DOI Creator Adapter

The DataCite adapter uses the official DataCite REST API to ingest DOI metadata creator mentions. It searches DOI metadata by query, then imports only creators whose name contains every query token.

Run:

```bash
npm run ingest:datacite -- --query="Jane Smith"
```

Important constraints:

- Use this as research output creator context only.
- DataCite query hits can be broad; the adapter filters creator names before import.
- Creator affiliation metadata may be absent, stale, or attached to an organization rather than a person.
- Do not display DataCite data as residential, contact, employment, or eligibility-screening evidence.

Source documentation:

- DataCite REST API: https://support.datacite.org/docs/api
- DataCite DOI list retrieval: https://support.datacite.org/docs/api-get-lists
- DataCite creator metadata schema: https://datacite-metadata-schema.readthedocs.io/en/4.5/properties/creator/

## NCBI PubMed E-utilities Adapter

The PubMed adapter uses NCBI E-utilities to search PubMed records by author and retrieve JSON summaries. It imports only matching authors from returned article summaries. PubMed often returns abbreviated author names, so the mapper allows initial-based given-name matches when the family name matches.

Run:

```bash
npm run ingest:pubmed -- --query="Jane Smith"
```

NCBI recommends identifying tools and supports optional email/API key parameters:

```bash
npm run ingest:pubmed -- --query="Jane Smith" --email=you@example.com
```

Important constraints:

- Use this as biomedical literature author context only.
- PubMed author names are frequently abbreviated and not globally unique.
- A PubMed article hit is not identity verification, contact evidence, residential evidence, or medical information about the author.
- Do not use PubMed data for employment, tenant screening, credit, insurance, eligibility decisions, or health inference about a person.

Source documentation:

- NCBI E-utilities introduction: https://www.ncbi.nlm.nih.gov/books/NBK25497/
- NCBI E-utilities parameters and JSON notes: https://www.ncbi.nlm.nih.gov/books/NBK25499/
- NCBI APIs overview: https://www.ncbi.nlm.nih.gov/home/develop/api/

## Internet Archive Advanced Search Adapter

The Internet Archive adapter uses the public Advanced Search JSON endpoint to ingest item creator metadata. It searches `creator:"name"` and imports only creators whose name contains every query token.

Run:

```bash
npm run ingest:internet-archive -- --query="Jane Smith"
```

Important constraints:

- Use this as cultural/library/archive creator context only.
- Internet Archive item creator metadata may represent authors, contributors, uploaders, organizations, or collection-level metadata.
- Do not treat item metadata as residential, contact, employment, or identity-verification evidence.
- Do not download item files through this adapter; it only ingests metadata.

Source documentation:

- Internet Archive APIs: https://archive.org/developers/index-apis.html
- Internet Archive search help: https://archive.org/help/aboutsearch.htm
- Internet Archive advanced search: https://archive.org/advancedsearch.php

## arXiv API Adapter

The arXiv adapter uses the official arXiv API Atom feed to ingest preprint author metadata. It searches the author field with `au:"name"` and imports only authors whose name contains every query token.

Run:

```bash
npm run ingest:arxiv -- --query="Jane Smith"
```

Important constraints:

- Use this as preprint author context only.
- arXiv author names are not globally unique and may be ambiguous.
- Do not treat arXiv metadata as residential, contact, employment, eligibility, or identity-verification evidence.
- Production usage must follow arXiv API terms and include arXiv's requested acknowledgement: "Thank you to arXiv for use of its open access interoperability."

Source documentation:

- arXiv API access guidance: https://info.arxiv.org/help/api/index.html
- arXiv API user manual: https://info.arxiv.org/help/api/user-manual.html
- arXiv bulk data/API note: https://info.arxiv.org/help/bulk_data.html

## Open Library Authors Adapter

The Open Library adapter uses the official Open Library Authors search API to ingest public library/catalog author metadata. It imports only author records whose name contains every query token.

Run:

```bash
npm run ingest:open-library -- --query="Jane Smith"
```

Important constraints:

- Use this as library/catalog author context only.
- Open Library is community-editable and records can be merged, split, incomplete, or ambiguous.
- Birth dates, subjects, and work counts are metadata context, not identity verification or eligibility-screening evidence.
- Do not use Open Library data as residential or contact evidence.

Source documentation:

- Open Library APIs: https://openlibrary.org/developers/api
- Open Library Authors API: https://openlibrary.org/dev/docs/api/authors
- Open Library Search API: https://openlibrary.org/dev/docs/api/search

## Library of Congress Search Adapter

The Library of Congress adapter uses the id.loc.gov search endpoint with JSON output to ingest very low-confidence authority/catalog context. Search results can represent names, works, subjects, and resources, so the adapter imports only entries whose title contains every query token.

Run:

```bash
npm run ingest:library-of-congress -- --query="Jane Smith"
```

Important constraints:

- Use this as authority/catalog context only.
- id.loc.gov search results are not necessarily person authorities; many are works or resource records.
- Treat matches as low-confidence context and show source provenance before using them in a profile.
- Do not use Library of Congress search results as residential, contact, employment, or identity-verification evidence.

Source documentation:

- id.loc.gov searching: https://id.loc.gov/techcenter/searching.html
- id.loc.gov technical center: https://id.loc.gov/techcenter/
- Library of Congress Linked Data Service: https://id.loc.gov/

## GitHub Public User Adapter

The GitHub adapter uses the official GitHub REST API user search endpoint, then hydrates each result with the public user endpoint. It imports only public users whose public name or login contains every query token.

Run:

```bash
npm run ingest:github -- --query="Jane Smith"
```

For higher rate limits, provide a token through `GITHUB_TOKEN` or `--token`:

```bash
GITHUB_TOKEN=your_token npm run ingest:github -- --query="Jane Smith"
```

Important constraints:

- Use this as public developer profile context only.
- GitHub profile names, locations, companies, blogs, and bios are user-entered and not verified identity, contact, residence, or employment evidence.
- Do not use GitHub profile data for employment screening, tenant screening, credit, insurance, eligibility decisions, harassment, or identity verification.
- Respect GitHub REST API rate limits and authentication guidance.

Source documentation:

- GitHub REST API docs: https://docs.github.com/rest
- GitHub user endpoints: https://docs.github.com/en/rest/users/users
- GitHub search endpoints: https://docs.github.com/en/rest/search/search

## Stack Exchange Users Adapter

The Stack Exchange adapter uses the official Stack Exchange API `/users` endpoint with the `inname` parameter. It imports only users whose display name contains every query token.

Run:

```bash
npm run ingest:stack-exchange -- --query="Jane Smith" --site=stackoverflow
```

Important constraints:

- Use this as public Q&A profile context only.
- Display names and locations are user-entered and may be pseudonymous, incomplete, misleading, or shared by many people.
- Reputation and badges are platform activity metadata, not identity or eligibility evidence.
- Do not use Stack Exchange data for employment screening, tenant screening, credit, insurance, eligibility decisions, harassment, or identity verification.

Source documentation:

- Stack Exchange API docs: https://api.stackexchange.com/docs
- Stack Exchange users endpoint: https://api.stackexchange.com/docs/users
- Stack Exchange API filters and usage: https://api.stackexchange.com/docs/filters

## VIAF Authority Search Adapter

The VIAF adapter uses the VIAF search endpoint with JSON content negotiation to ingest library authority cluster headings. It imports only headings whose text contains every query token.

Run:

```bash
npm run ingest:viaf -- --query="Mark Twain"
```

Important constraints:

- Use this as library authority/catalog context only.
- VIAF clusters can contain alternate headings, historical authority data, and ambiguous names; a heading match is not identity verification.
- VIAF metadata is not residential, contact, employment, eligibility, or screening evidence.
- Production usage should cache results, respect service availability, and display VIAF IDs/source provenance for disambiguation.

Source documentation:

- VIAF API overview: https://developer.api.oclc.org/viaf-api
- VIAF data overview: https://viaf.org/en/viaf/data
- VIAF service: https://viaf.org/

## MusicBrainz Artist Search Adapter

The MusicBrainz adapter uses the official MusicBrainz `/ws/2/artist/` search API with JSON output. It searches person-type artists and imports only artist names whose display name contains every query token.

Run:

```bash
npm run ingest:musicbrainz -- --query="Taylor Swift"
```

Important constraints:

- Use this as public music metadata context only.
- Artist names, locations, life-span fields, ISNI values, and disambiguation notes are music catalog metadata, not residential/contact evidence.
- Do not use MusicBrainz data for employment screening, tenant screening, credit, insurance, eligibility decisions, harassment, or identity verification.
- Production usage must send an identifying User-Agent, rate-limit requests, and respect MusicBrainz license requirements.

Source documentation:

- MusicBrainz API search docs: https://musicbrainz.org/doc/MusicBrainz_API/Search
- MusicBrainz API overview: https://musicbrainz.org/doc/MusicBrainz_API
- MusicBrainz data licenses: https://musicbrainz.org/doc/MusicBrainz_Database/License

## ORCID Public Registry Adapter

The ORCID adapter uses the public ORCID API expanded search endpoint to ingest public researcher identifier metadata. It imports only records whose credit name or given/family name contains every query token.

Run:

```bash
npm run ingest:orcid -- --query="Jane Smith"
```

Important constraints:

- Use this as researcher identifier context only.
- ORCID records are self-managed by researchers and may omit fields, contain historical affiliations, or represent people with common names.
- Do not ingest or display ORCID email fields as contact evidence; this adapter intentionally ignores them.
- Do not use ORCID public metadata as residential, employment, identity-verification, or eligibility-screening evidence.

Source documentation:

- ORCID Public API: https://info.orcid.org/what-is-orcid/services/public-api/
- ORCID registry search tutorial: https://info.orcid.org/documentation/api-tutorials/api-tutorial-searching-the-orcid-registry/
- ORCID public data file: https://info.orcid.org/documentation/features/public-data-file/

## Semantic Scholar Author Search Adapter

The Semantic Scholar adapter uses the official Academic Graph author search endpoint to ingest scholarly author profile metadata. It imports only author names whose display name contains every query token.

Run:

```bash
npm run ingest:semantic-scholar -- --query="Jane Smith"
```

For higher rate limits, provide an API key through `SEMANTIC_SCHOLAR_API_KEY` or `--api-key`:

```bash
SEMANTIC_SCHOLAR_API_KEY=your_key npm run ingest:semantic-scholar -- --query="Jane Smith"
```

Important constraints:

- Use this as scholarly publication context only.
- Author pages can be ambiguous or merged/split incorrectly; show source provenance and allow reporting incorrect matches.
- Affiliations, homepages, ORCID IDs, citation counts, and h-index values are metadata context, not verified employment or identity evidence.
- Do not use Semantic Scholar data for employment screening, tenant screening, credit, insurance, eligibility decisions, harassment, or identity verification.
- Anonymous API access can be rate-limited; production usage should use an API key, caching, and backoff.

Source documentation:

- Semantic Scholar API product page: https://www.semanticscholar.org/product/api
- Semantic Scholar API docs: https://api.semanticscholar.org/api-docs/
- Semantic Scholar API tutorial: https://www.semanticscholar.org/product/api/tutorial

## Google Books Volumes Adapter

The Google Books adapter uses the official Volumes API to search book/catalog metadata with an `inauthor` query. It imports only volume author names whose displayed author string contains every query token.

Run:

```bash
npm run ingest:google-books -- --query="Jane Smith"
```

For higher quota or authenticated project tracking, provide an API key through `GOOGLE_BOOKS_API_KEY` or `--api-key`:

```bash
GOOGLE_BOOKS_API_KEY=your_key npm run ingest:google-books -- --query="Jane Smith"
```

Important constraints:

- Use this as book/catalog author context only.
- Google Books volume metadata can be incomplete, duplicated, edition-specific, or attached to organizations rather than people.
- Author metadata is not residential, contact, employment, identity-verification, or eligibility-screening evidence.
- The API caps `maxResults` at 40 for a single request; omit `--limit` to use the source's default response size, and add pagination later for exhaustive collection.

Source documentation:

- Google Books Volumes list API: https://developers.google.com/books/docs/v1/reference/volumes/list
- Google Books API usage guide: https://developers.google.com/books/docs/v1/using
- Google Books API terms: https://developers.google.com/books/terms

## Europe PMC Articles Adapter

The Europe PMC adapter uses the Articles RESTful API search endpoint to ingest life-science publication author metadata. It searches the `AUTH` field and imports only article authors whose name contains every query token.

Run:

```bash
npm run ingest:europe-pmc -- --query="Jane Smith"
```

Important constraints:

- Use this as life-science publication author context only.
- Europe PMC author strings can be abbreviated, ambiguous, or attached to group authors; the adapter filters names before import.
- Affiliation text may contain public correspondence emails in the raw source, but this adapter strips email-like strings from imported location metadata and imports no contact records.
- Do not use Europe PMC data as residential, contact, medical, employment, identity-verification, or eligibility-screening evidence.
- Full collection requires cursor-based pagination; omit `--limit` for normal source defaults and use `--limit=n` only for bounded local runs.

Source documentation:

- Europe PMC Articles RESTful API: https://europepmc.org/RestfulWebService
- Europe PMC search help: https://europepmc.org/help
- Europe PMC API overview via rOpenSci: https://docs.ropensci.org/europepmc/
