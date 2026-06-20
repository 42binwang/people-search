# Aggregate Economic Sources

These sources provide geography-level economic context for target regions. They do not import person-level, address-level, employer-level, tax-return-level, device-level, or household-level records.

## U.S. Census County Business Patterns All-Sector County Business Metrics

Origin: U.S. Census Bureau County Business Patterns API.

Adapter: `lib/sources/census-cbp-county-business.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-cbp-county-business.ts -- --config=configs/economic-sources/census-cbp-county-business-2023-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/census-cbp-county-business-2023-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County-year |

Source filters:

| Predicate | Value | Meaning |
| --- | --- | --- |
| `NAICS2017` | `00` | Total for all sectors |
| `LFO` | `001` | All establishments |
| `EMPSZES` | `001` | All establishments |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `establishments` | `ESTAB` | Number of establishments |
| `employment` | `EMP` | Number of employees during the pay period including March 12 |
| `annual_payroll_thousands` | `PAYANN` | Annual payroll in thousands of dollars |
| `naics_code`, `naics_label` | `NAICS2017`, `NAICS2017_LABEL` | Industry selection |
| `legal_form_code`, `legal_form_label` | `LFO`, `LFO_LABEL` | Legal form filter |
| `employment_size_code`, `employment_size_label` | `EMPSZES`, `EMPSZES_LABEL` | Employment-size filter |

Update frequency: County Business Patterns is released annually. The current config uses the 2023 CBP release, the newest release confirmed in the Census CBP API metadata during implementation.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate county-year business data and should be displayed with source year and geography.
- Do not present county-level business totals as evidence about any specific person, household, address, employer, job, income, payroll, tax record, benefit status, eligibility, or wealth level.
- Do not combine these metrics with individual profiles to infer employment, income, wealth, residence, employer, occupancy, or household finances.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed, withheld, not-applicable, or nonnumeric values are stored as `null`.

## U.S. BLS Local Area Unemployment Statistics County Labor Metrics

Origin: U.S. Bureau of Labor Statistics Local Area Unemployment Statistics public API.

Adapter: `lib/sources/bls-laus-county-labor.ts`

CLI:

```bash
npx tsx scripts/ingest-bls-laus-county-labor.ts -- --config=configs/economic-sources/bls-laus-county-labor-2024-2026-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/bls-laus-county-labor-2024-2026-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County-month |

Stored fields:

| Stored field | LAUS measure | Meaning |
| --- | --- | --- |
| `labor_force` | LAUS measure `06` | County labor force count |
| `employment` | LAUS measure `05` | County employed count |
| `unemployment` | LAUS measure `04` | County unemployed count |
| `unemployment_rate` | LAUS measure `03` | County unemployment rate percent |

Series ID convention:

- `LAUCN{state_fips}{county_fips}0000000003`: unemployment rate.
- `LAUCN{state_fips}{county_fips}0000000004`: unemployment count.
- `LAUCN{state_fips}{county_fips}0000000005`: employment count.
- `LAUCN{state_fips}{county_fips}0000000006`: labor force count.

Update frequency: LAUS county data is released monthly and may be revised. The current config requests 2024 through 2026 data for all nine Bay Area counties.

Usage restrictions:

- Data is aggregate county-month labor-market estimate data and should be displayed with source year, period, geography, and revision context when available.
- Do not present county-level labor metrics as evidence about any specific person, household, address, employer, job, income, unemployment status, benefit status, eligibility, or wealth level.
- Do not combine these metrics with individual profiles to infer employment, unemployment, income, wealth, residence, employer, occupancy, or household finances.

Failure handling:

- Non-OK BLS responses fail with status and status text.
- BLS payloads whose status is not `REQUEST_SUCCEEDED` fail with explicit errors.
- Non-JSON responses and payloads without series fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.
- A BLS registration key is optional. If needed, pass it through `BLS_API_KEY`; do not commit it in config files.

## U.S. Census ACS 5-Year Household Income Distribution

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP03`, "Selected Economic Characteristics."

Adapter: `lib/sources/census-acs-household-income.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-household-income.ts -- --config=configs/economic-sources/census-acs-household-income-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/census-acs-household-income-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_households` | `DP03_0051E` | Total households in the household-income distribution |
| `income_under_10k`, `income_under_10k_pct` | `DP03_0052E`, `DP03_0052PE` | Households with income below $10,000 |
| `income_10k_to_14999`, `income_10k_to_14999_pct` | `DP03_0053E`, `DP03_0053PE` | Households with income $10,000 to $14,999 |
| `income_15k_to_24999`, `income_15k_to_24999_pct` | `DP03_0054E`, `DP03_0054PE` | Households with income $15,000 to $24,999 |
| `income_25k_to_34999`, `income_25k_to_34999_pct` | `DP03_0055E`, `DP03_0055PE` | Households with income $25,000 to $34,999 |
| `income_35k_to_49999`, `income_35k_to_49999_pct` | `DP03_0056E`, `DP03_0056PE` | Households with income $35,000 to $49,999 |
| `income_50k_to_74999`, `income_50k_to_74999_pct` | `DP03_0057E`, `DP03_0057PE` | Households with income $50,000 to $74,999 |
| `income_75k_to_99999`, `income_75k_to_99999_pct` | `DP03_0058E`, `DP03_0058PE` | Households with income $75,000 to $99,999 |
| `income_100k_to_149999`, `income_100k_to_149999_pct` | `DP03_0059E`, `DP03_0059PE` | Households with income $100,000 to $149,999 |
| `income_150k_to_199999`, `income_150k_to_199999_pct` | `DP03_0060E`, `DP03_0060PE` | Households with income $150,000 to $199,999 |
| `income_200k_plus`, `income_200k_plus_pct` | `DP03_0061E`, `DP03_0061PE` | Households with income $200,000 or more |
| `median_household_income` | `DP03_0062E` | Median household income in dollars |
| `mean_household_income` | `DP03_0063E` | Mean household income in dollars |
| `income_under_50k`, `income_under_50k_pct` | Derived from `DP03_0052` through `DP03_0056` buckets | Households with income below $50,000 |
| `income_100k_plus`, `income_100k_plus_pct` | Derived from `DP03_0059` through `DP03_0061` buckets | Households with income $100,000 or more |
| `income_150k_plus`, `income_150k_plus_pct` | Derived from `DP03_0060` and `DP03_0061` buckets | Households with income $150,000 or more |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level income estimates as evidence about any specific person, employer, household, address, income, asset, tax record, benefit record, or wealth level.
- Do not combine these metrics with individual profiles to infer income, employment, wealth, residence, occupancy, or household finances.

Assumptions:

- `income_under_50k` is a low-income rollup for aggregate economic context.
- `income_100k_plus` and `income_150k_plus` are Bay Area-focused rollups that make high-cost-region income distribution easier to compare across counties.
- The adapter preserves all original household-income buckets used in those rollups.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived rollups are `null` only when all source buckets in that rollup are unavailable.

## U.S. Census ACS 5-Year Employment Status

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP03`, "Selected Economic Characteristics."

Adapter: `lib/sources/census-acs-employment-status.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-employment-status.ts -- --config=configs/economic-sources/census-acs-employment-status-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/census-acs-employment-status-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `population_16_plus` | `DP03_0001E` | Population age 16 and over |
| `in_labor_force`, `in_labor_force_pct` | `DP03_0002E`, `DP03_0002PE` | Population age 16 and over in the labor force |
| `civilian_labor_force`, `civilian_labor_force_pct` | `DP03_0003E`, `DP03_0003PE` | Civilian labor force |
| `employed`, `employed_pct` | `DP03_0004E`, `DP03_0004PE` | Employed civilian labor force |
| `unemployed`, `unemployed_pct` | `DP03_0005E`, `DP03_0005PE` | Unemployed civilian labor force |
| `armed_forces`, `armed_forces_pct` | `DP03_0006E`, `DP03_0006PE` | Armed Forces population in the labor force |
| `not_in_labor_force`, `not_in_labor_force_pct` | `DP03_0007E`, `DP03_0007PE` | Population age 16 and over not in the labor force |
| `unemployment_rate` | `DP03_0009PE` | Census-reported unemployment rate |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level employment estimates as evidence about any specific person, household, address, employer, job, income, benefit status, eligibility, or wealth level.
- Do not combine these metrics with individual profiles to infer employment, income, wealth, residence, occupancy, or household finances.

Assumptions:

- Percent fields are stored as Census-reported percentages, not ratios.
- Raw Census row values are preserved for source provenance.
- Employment-status estimates describe aggregate county populations and are not employment records for individuals.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## U.S. Census ACS 5-Year Educational Attainment

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP02`, "Selected Social Characteristics in the United States."

Adapter: `lib/sources/census-acs-educational-attainment.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-educational-attainment.ts -- --config=configs/economic-sources/census-acs-educational-attainment-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/census-acs-educational-attainment-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `population_25_plus` | `DP02_0059E` | Population age 25 and over |
| `less_than_9th_grade`, `less_than_9th_grade_pct` | `DP02_0060E`, `DP02_0060PE` | Less than 9th grade |
| `ninth_to_12th_no_diploma`, `ninth_to_12th_no_diploma_pct` | `DP02_0061E`, `DP02_0061PE` | 9th to 12th grade, no diploma |
| `high_school_graduate`, `high_school_graduate_pct` | `DP02_0062E`, `DP02_0062PE` | High school graduate, including equivalency |
| `some_college_no_degree`, `some_college_no_degree_pct` | `DP02_0063E`, `DP02_0063PE` | Some college, no degree |
| `associates_degree`, `associates_degree_pct` | `DP02_0064E`, `DP02_0064PE` | Associate's degree |
| `bachelors_degree`, `bachelors_degree_pct` | `DP02_0065E`, `DP02_0065PE` | Bachelor's degree |
| `graduate_professional_degree`, `graduate_professional_degree_pct` | `DP02_0066E`, `DP02_0066PE` | Graduate or professional degree |
| `high_school_graduate_or_higher`, `high_school_graduate_or_higher_pct` | `DP02_0067E`, `DP02_0067PE` | High school graduate or higher |
| `bachelors_degree_or_higher`, `bachelors_degree_or_higher_pct` | `DP02_0068E`, `DP02_0068PE` | Bachelor's degree or higher |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level educational-attainment estimates as evidence about any specific person, household, address, degree, school record, employment status, income, benefit status, eligibility, or wealth level.
- Do not combine these metrics with individual profiles to infer education, income, employment, wealth, residence, occupancy, or household finances.

Assumptions:

- Percent fields are stored as Census-reported percentages, not ratios.
- Raw Census row values are preserved for source provenance.
- Education attainment estimates describe aggregate county populations age 25 and over, not individual credentials.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## U.S. Census ACS 5-Year Health Insurance Coverage

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP03`, "Selected Economic Characteristics."

Adapter: `lib/sources/census-acs-health-insurance.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-health-insurance.ts -- --config=configs/economic-sources/census-acs-health-insurance-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/census-acs-health-insurance-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `civilian_noninstitutionalized_population` | `DP03_0095E` | Civilian noninstitutionalized population |
| `with_health_insurance`, `with_health_insurance_pct` | `DP03_0096E`, `DP03_0096PE` | People with health insurance coverage |
| `private_health_insurance`, `private_health_insurance_pct` | `DP03_0097E`, `DP03_0097PE` | People with private health insurance |
| `public_coverage`, `public_coverage_pct` | `DP03_0098E`, `DP03_0098PE` | People with public coverage |
| `no_health_insurance`, `no_health_insurance_pct` | `DP03_0099E`, `DP03_0099PE` | People with no health insurance coverage |
| `under_19_population` | `DP03_0100E` | Civilian noninstitutionalized population under 19 years |
| `under_19_no_health_insurance`, `under_19_no_health_insurance_pct` | `DP03_0101E`, `DP03_0101PE` | People under 19 with no health insurance coverage |
| `age_19_to_64_population` | `DP03_0102E` | Civilian noninstitutionalized population age 19 to 64 |
| `employed_age_19_to_64_no_health_insurance`, `employed_age_19_to_64_no_health_insurance_pct` | `DP03_0108E`, `DP03_0108PE` | Employed people age 19 to 64 with no health insurance coverage |
| `unemployed_age_19_to_64_no_health_insurance`, `unemployed_age_19_to_64_no_health_insurance_pct` | `DP03_0113E`, `DP03_0113PE` | Unemployed people age 19 to 64 with no health insurance coverage |
| `not_in_labor_force_age_19_to_64_no_health_insurance`, `not_in_labor_force_age_19_to_64_no_health_insurance_pct` | `DP03_0118E`, `DP03_0118PE` | People age 19 to 64 not in the labor force with no health insurance coverage |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level health-insurance estimates as evidence about any specific person, household, address, medical condition, insurance status, claim, income, benefit status, eligibility, or wealth level.
- Do not combine these metrics with individual profiles to infer health coverage, medical status, income, employment, wealth, residence, occupancy, or household finances.

Assumptions:

- Percent fields are stored as Census-reported percentages, not ratios.
- Public and private coverage categories may overlap because people can have more than one coverage type.
- Raw Census row values are preserved for source provenance.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## U.S. Census ACS 5-Year Poverty and Public Assistance

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP03`, "Selected Economic Characteristics."

Adapter: `lib/sources/census-acs-poverty-assistance.ts`

CLI:

```bash
CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-poverty-assistance.ts -- --config=configs/economic-sources/census-acs-poverty-assistance-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/census-acs-poverty-assistance-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `cash_public_assistance_households`, `cash_public_assistance_households_pct` | `DP03_0072E`, `DP03_0072PE` | Households with cash public assistance income |
| `mean_cash_public_assistance_income` | `DP03_0073E` | Mean cash public assistance income in dollars among applicable households |
| `snap_households`, `snap_households_pct` | `DP03_0074E`, `DP03_0074PE` | Households with Food Stamp/SNAP benefits in the past 12 months |
| `families_below_poverty`, `families_below_poverty_pct` | `DP03_0119E`, `DP03_0119PE` | Families below the poverty level |
| `families_with_children_below_poverty`, `families_with_children_below_poverty_pct` | `DP03_0120E`, `DP03_0120PE` | Families with related children under 18 below the poverty level |
| `female_householder_families_below_poverty`, `female_householder_families_below_poverty_pct` | `DP03_0125E`, `DP03_0125PE` | Female-householder families with no spouse present below the poverty level |
| `people_below_poverty`, `people_below_poverty_pct` | `DP03_0128E`, `DP03_0128PE` | All people below the poverty level |
| `children_below_poverty`, `children_below_poverty_pct` | `DP03_0129E`, `DP03_0129PE` | People under 18 below the poverty level |
| `adults_18_to_64_below_poverty`, `adults_18_to_64_below_poverty_pct` | `DP03_0134E`, `DP03_0134PE` | People age 18 to 64 below the poverty level |
| `adults_65_plus_below_poverty`, `adults_65_plus_below_poverty_pct` | `DP03_0135E`, `DP03_0135PE` | People age 65 and over below the poverty level |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level poverty or public-assistance estimates as evidence about any specific person, household, address, income, benefit status, eligibility, asset, tax record, or wealth level.
- Do not combine these metrics with individual profiles to infer poverty status, public benefits, income, employment, wealth, residence, occupancy, or household finances.

Assumptions:

- Poverty and assistance estimates are separate aggregate context signals. They are not person-level benefit records.
- Percent fields are stored as Census-reported percentages, not ratios.
- Raw Census row values are preserved for source provenance.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## HUD Low/Moderate Income Population by Block Group

Origin: HUD open-data ArcGIS FeatureServer layer `LOW_MOD_INCOME_BY_BG`, "Low to Moderate Income Population by Block Group."

Adapter: `lib/sources/hud-low-moderate-income-block-groups.ts`

CLI:

```bash
npx tsx scripts/ingest-hud-low-moderate-income-block-groups.ts -- --config=configs/economic-sources/hud-low-mod-income-bg-2020-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/economic-sources/hud-low-mod-income-bg-2020-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County rollups from block-group rows |

Stored fields:

| Stored field | HUD field or derivation | Meaning |
| --- | --- | --- |
| `block_group_count` | Count of imported block-group rows | Number of source block-group rows in the county aggregate |
| `low_persons` | Sum of `Low` | Persons counted by HUD in the low-income category |
| `low_mod_persons` | Sum of `Lowmod` | Persons counted by HUD in the low/moderate-income category |
| `low_moderate_middle_income_persons` | Sum of `Lmmi` | Persons counted by HUD in the low, moderate, and middle-income categories |
| `low_mod_universe` | Sum of `Lowmoduniv` | Source low/moderate-income universe denominator |
| `low_mod_pct` | `low_mod_persons / low_mod_universe` | Weighted county low/moderate-income share as a ratio |
| `block_groups_51_pct_plus` | Count of rows where `Lowmod_pct >= 0.51` | Number of block-group rows at or above a 51% low/moderate-income share |

Update frequency: HUD updates the open-data layer periodically when underlying CDBG low/moderate-income summary data is refreshed. The current config labels the public source period as ACS 2016-2020; the raw source value is preserved in `raw_json.sourceValues`.

Usage restrictions:

- Data is aggregate block-group/county context and must not be displayed as evidence about any specific person, household, address, income, benefit status, residence, eligibility, asset, tax record, or wealth level.
- Do not combine these metrics with individual profiles to infer income, employment, wealth, residence, occupancy, public-assistance status, or household finances.
- The adapter requests only tabular non-personal fields and `returnGeometry=false`; it does not request or store geometry, names, addresses, tenants, owners, contacts, property records, devices, household-level rows, or parcel records.

Assumptions:

- `low_mod_pct` is recalculated as a weighted county ratio from summed counts instead of averaging block-group percentages.
- `block_groups_51_pct_plus` is a count of source rows meeting the 51% threshold. It is not an eligibility determination for any household, address, parcel, or person.
- Raw block-group GEOIDs are retained only as source provenance for the aggregate rollup.

Failure handling:

- Non-OK ArcGIS responses fail with status and status text.
- ArcGIS error payloads, non-JSON responses, malformed feature arrays, and missing configured fields fail with explicit errors.
- Suppressed, blank, or malformed numeric values are stored as `null` when no valid source row contributes to a county metric.
