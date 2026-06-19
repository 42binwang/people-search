# Aggregate Housing Stock Sources

Housing stock, occupancy, vacancy, tenure, affordability, and crowding metrics provide privacy-compliant residential context for interpreting aggregate mobility patterns. These sources do not include names, exact addresses, devices, or household-level records.

## U.S. Census ACS 5-Year Housing Characteristics

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP04`, "Selected Housing Characteristics."

Adapter: `lib/sources/census-acs-housing.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-housing -- --config=configs/housing-stock-sources/census-acs-2024-bay-area.json
CENSUS_API_KEY=... npm run ingest:census-acs-housing -- --config=configs/housing-stock-sources/census-acs-2024-nyc.json
CENSUS_API_KEY=... npm run ingest:census-acs-housing -- --config=configs/housing-stock-sources/census-acs-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/housing-stock-sources/census-acs-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/housing-stock-sources/census-acs-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_housing_units` | `DP04_0001E` | Total housing units |
| `occupied_housing_units` / `occupied_housing_pct` | `DP04_0002E` / `DP04_0002PE` | Occupied housing units |
| `vacant_housing_units` / `vacant_housing_pct` | `DP04_0003E` / `DP04_0003PE` | Vacant housing units |
| `homeowner_vacancy_rate` | `DP04_0004E` | Homeowner vacancy rate |
| `rental_vacancy_rate` | `DP04_0005E` | Rental vacancy rate |
| `owner_occupied_units` / `owner_occupied_pct` | `DP04_0046E` / `DP04_0046PE` | Owner-occupied units |
| `renter_occupied_units` / `renter_occupied_pct` | `DP04_0047E` / `DP04_0047PE` | Renter-occupied units |
| `median_home_value` | `DP04_0089E` | Median value for owner-occupied units |
| `median_gross_rent` | `DP04_0134E` | Median gross rent |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level housing estimates as evidence about any person, household, or exact address.
- Do not combine these metrics with individual profiles to infer personal movement, occupancy, or current residence.

Assumptions:

- "Bay Area" means the nine-county San Francisco Bay Area.
- "New York City" means the five borough counties.
- "Greater Seattle" means King, Pierce, and Snohomish counties as a practical Seattle-Tacoma-Bellevue tech-hub approximation.
- County-level DP04 estimates are sufficient for initial aggregate mobility context; tract-level support can be added later if finer geography and proper margin-of-error handling are needed.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

## U.S. Census ACS 5-Year Housing Structure and Age

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP04`, units-in-structure and year-built variables.

Adapter: `lib/sources/census-acs-housing-structure.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-housing-structure -- --config=configs/housing-stock-sources/census-acs-housing-structure-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-housing-structure-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_housing_units` | `DP04_0006E` | Total housing units denominator for units-in-structure estimates |
| `one_unit_detached`, `one_unit_detached_pct` | `DP04_0007E`, `DP04_0007PE` | Detached single-unit structures |
| `one_unit_attached`, `one_unit_attached_pct` | `DP04_0008E`, `DP04_0008PE` | Attached single-unit structures |
| `two_units`, `three_or_four_units`, `five_to_nine_units` and percentages | `DP04_0009` through `DP04_0011` fields | Small multifamily structure buckets |
| `ten_to_nineteen_units`, `twenty_plus_units` and percentages | `DP04_0012` through `DP04_0013` fields | Larger multifamily structure buckets |
| `mobile_home_units`, `boat_rv_van_units` and percentages | `DP04_0014` through `DP04_0015` fields | Mobile home and boat/RV/van housing-unit buckets |
| `built_2020_or_later` through `built_1939_or_earlier` and percentages | `DP04_0017` through `DP04_0026` fields | Year-structure-built buckets |
| `single_family_units`, `single_family_units_pct` | Derived from `DP04_0007` + `DP04_0008` fields | Detached plus attached one-unit structures |
| `small_multifamily_units`, `small_multifamily_units_pct` | Derived from `DP04_0009` + `DP04_0010` + `DP04_0011` fields | 2 to 9 unit structures |
| `large_multifamily_units`, `large_multifamily_units_pct` | Derived from `DP04_0012` + `DP04_0013` fields | 10+ unit structures |
| `built_2010_or_later`, `built_2010_or_later_pct` | Derived from `DP04_0017` + `DP04_0018` fields | Newer housing stock |
| `built_before_1960`, `built_before_1960_pct` | Derived from `DP04_0024` + `DP04_0025` + `DP04_0026` fields | Older housing stock |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level structure or year-built estimates as evidence about any specific address, building, owner, household, occupancy state, or residence.
- Do not combine these metrics with individual profiles to infer personal movement, occupancy, exact housing type, or current residence.

Assumptions:

- The first implementation is Bay Area focused and uses the same nine-county definition as other Bay Area sources.
- Derived single-family, multifamily, newer-stock, and older-stock fields are analysis conveniences; original Census buckets are preserved.
- County-level housing-structure mix helps interpret aggregate mobility and housing-supply pressure, especially where multifamily stock or older stock differs sharply by county.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived rollups are `null` only when all source buckets for that rollup are unavailable.

## U.S. Census ACS 5-Year Household Composition

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP02`, household-type variables.

Adapter: `lib/sources/census-acs-household-composition.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-household-composition -- --config=configs/housing-stock-sources/census-acs-household-composition-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-household-composition-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_households` | `DP02_0001E` | Total households |
| `married_couple_households`, `married_couple_households_pct` | `DP02_0002E`, `DP02_0002PE` | Married-couple households |
| `married_couple_with_children`, `married_couple_with_children_pct` | `DP02_0003E`, `DP02_0003PE` | Married-couple households with children of the householder under 18 |
| `cohabiting_couple_households`, `cohabiting_couple_households_pct` | `DP02_0004E`, `DP02_0004PE` | Cohabiting-couple households |
| `cohabiting_couple_with_children`, `cohabiting_couple_with_children_pct` | `DP02_0005E`, `DP02_0005PE` | Cohabiting-couple households with children of the householder under 18 |
| `male_no_spouse_households`, `male_no_spouse_households_pct` | `DP02_0006E`, `DP02_0006PE` | Male householder, no spouse or partner present |
| `male_living_alone`, `male_living_alone_pct` | `DP02_0008E`, `DP02_0008PE` | Male householder living alone |
| `male_living_alone_65_plus`, `male_living_alone_65_plus_pct` | `DP02_0009E`, `DP02_0009PE` | Male householder living alone, age 65+ |
| `female_no_spouse_households`, `female_no_spouse_households_pct` | `DP02_0010E`, `DP02_0010PE` | Female householder, no spouse or partner present |
| `female_living_alone`, `female_living_alone_pct` | `DP02_0012E`, `DP02_0012PE` | Female householder living alone |
| `female_living_alone_65_plus`, `female_living_alone_65_plus_pct` | `DP02_0013E`, `DP02_0013PE` | Female householder living alone, age 65+ |
| `households_with_under_18`, `households_with_under_18_pct` | `DP02_0014E`, `DP02_0014PE` | Households with one or more people under 18 |
| `households_with_65_plus`, `households_with_65_plus_pct` | `DP02_0015E`, `DP02_0015PE` | Households with one or more people age 65+ |
| `average_household_size` | `DP02_0016E` | Average household size |
| `average_family_size` | `DP02_0017E` | Average family size |
| `single_person_households`, `single_person_households_pct` | Derived from `DP02_0008` + `DP02_0012` fields | Male and female householders living alone |
| `living_alone_65_plus`, `living_alone_65_plus_pct` | Derived from `DP02_0009` + `DP02_0013` fields | Male and female householders age 65+ living alone |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level household-composition estimates as evidence about any specific household, family, address, occupancy state, or residence.
- Do not combine these metrics with individual profiles to infer household composition, family relationships, personal movement, occupancy, or current residence.

Assumptions:

- The first implementation is Bay Area focused and uses the same nine-county definition as other Bay Area sources.
- Single-person and 65+ living-alone fields are derived by summing the male and female householder living-alone buckets because DP02 reports those as separate categories.
- County-level household-composition metrics are useful as context for household turnover, housing pressure, and regional residential-support needs.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived living-alone fields are `null` only when both source buckets are unavailable.

## U.S. Census ACS 5-Year Housing Cost Burden

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP04`, owner cost and gross-rent burden variables.

Adapter: `lib/sources/census-acs-housing-cost-burden.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-housing-cost-burden -- --config=configs/housing-stock-sources/census-acs-cost-burden-2024-bay-area.json
CENSUS_API_KEY=... npm run ingest:census-acs-housing-cost-burden -- --config=configs/housing-stock-sources/census-acs-cost-burden-2024-nyc.json
CENSUS_API_KEY=... npm run ingest:census-acs-housing-cost-burden -- --config=configs/housing-stock-sources/census-acs-cost-burden-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-cost-burden-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/housing-stock-sources/census-acs-cost-burden-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/housing-stock-sources/census-acs-cost-burden-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `owner_mortgage_units` | `DP04_0110E` | Owner units with a mortgage where cost burden can be computed |
| `owner_mortgage_30_to_34_pct`, `owner_mortgage_35_plus_pct` | `DP04_0114PE`, `DP04_0115PE` | Mortgage owner cost-burden percentage buckets |
| `owner_mortgage_30_plus`, `owner_mortgage_30_plus_pct` | Derived from `DP04_0114E` + `DP04_0115E` and percentages | Mortgage owner units spending 30% or more of income on selected monthly owner costs |
| `owner_no_mortgage_units` | `DP04_0117E` | Owner units without a mortgage where cost burden can be computed |
| `owner_no_mortgage_30_to_34_pct`, `owner_no_mortgage_35_plus_pct` | `DP04_0123PE`, `DP04_0124PE` | Non-mortgage owner cost-burden percentage buckets |
| `owner_no_mortgage_30_plus`, `owner_no_mortgage_30_plus_pct` | Derived from `DP04_0123E` + `DP04_0124E` and percentages | Non-mortgage owner units spending 30% or more of income on selected monthly owner costs |
| `renter_units` | `DP04_0136E` | Renter units where gross rent as a percentage of income can be computed |
| `renter_30_to_34_pct`, `renter_35_plus_pct` | `DP04_0141PE`, `DP04_0142PE` | Renter cost-burden percentage buckets |
| `renter_30_plus`, `renter_30_plus_pct` | Derived from `DP04_0141E` + `DP04_0142E` and percentages | Renter units spending 30% or more of income on gross rent |
| `median_owner_cost_with_mortgage` | `DP04_0101E` | Median selected monthly owner costs for units with a mortgage |
| `median_owner_cost_without_mortgage` | `DP04_0109E` | Median selected monthly owner costs for units without a mortgage |
| `median_gross_rent` | `DP04_0134E` | Median gross rent |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level cost burden as evidence about any person's income, rent, mortgage, household, or exact address.
- Do not combine these metrics with individual profiles to infer personal affordability, movement, occupancy, or current residence.

Assumptions:

- A 30%+ burden threshold is derived by summing the 30.0-34.9% and 35.0%+ Census buckets.
- The adapter preserves the original bucket percentages and stores derived 30%+ counts and percentages for common housing-affordability analysis.
- County-level cost-burden metrics are useful as housing pressure context for aggregate mobility analysis.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived 30%+ fields are `null` only when both source buckets are unavailable.

## U.S. Census ACS 5-Year Housing Crowding

Origin: U.S. Census Bureau American Community Survey 5-year Data Profiles, table group `DP04`, occupants-per-room variables.

Adapter: `lib/sources/census-acs-housing-crowding.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-housing-crowding -- --config=configs/housing-stock-sources/census-acs-crowding-2024-bay-area.json
CENSUS_API_KEY=... npm run ingest:census-acs-housing-crowding -- --config=configs/housing-stock-sources/census-acs-crowding-2024-nyc.json
CENSUS_API_KEY=... npm run ingest:census-acs-housing-crowding -- --config=configs/housing-stock-sources/census-acs-crowding-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-crowding-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/housing-stock-sources/census-acs-crowding-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/housing-stock-sources/census-acs-crowding-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `occupied_housing_units` | `DP04_0076E` | Occupied housing units with occupants-per-room estimates |
| `occupants_per_room_one_or_less`, `occupants_per_room_one_or_less_pct` | `DP04_0077E`, `DP04_0077PE` | Occupied units with 1.00 or fewer occupants per room |
| `occupants_per_room_one_to_one_point_five`, `occupants_per_room_one_to_one_point_five_pct` | `DP04_0078E`, `DP04_0078PE` | Occupied units with 1.01 to 1.50 occupants per room |
| `occupants_per_room_one_point_five_plus`, `occupants_per_room_one_point_five_plus_pct` | `DP04_0079E`, `DP04_0079PE` | Occupied units with 1.51 or more occupants per room |
| `overcrowded_units`, `overcrowded_pct` | Derived from `DP04_0078E` + `DP04_0079E` and percentages | Occupied units with more than 1.00 occupants per room |
| `severe_overcrowded_units`, `severe_overcrowded_pct` | `DP04_0079E`, `DP04_0079PE` | Occupied units with 1.51 or more occupants per room |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level crowding estimates as evidence about any specific household, address, household size, occupancy state, or residence.
- Do not combine these metrics with individual profiles to infer personal movement, household composition, occupancy, or current residence.

Assumptions:

- More than 1.00 occupants per room is treated as overcrowded for aggregate housing-pressure context.
- More than 1.50 occupants per room is treated as severe overcrowding.
- The adapter preserves the original Census buckets and stores derived overcrowded counts and percentages for common housing-pressure analysis.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived crowding fields are `null` only when both source buckets are unavailable.

## U.S. Census ACS 5-Year Housing Value and Rent Distribution

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP04`, "Selected Housing Characteristics."

Adapter: `lib/sources/census-acs-value-rent.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-value-rent -- --config=configs/housing-stock-sources/census-acs-value-rent-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-value-rent-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `owner_value_units` | `DP04_0080E` | Owner-occupied units with value estimates |
| `value_under_50k`, `value_under_50k_pct` | `DP04_0081E`, `DP04_0081PE` | Owner-occupied units valued below $50,000 |
| `value_50k_to_99999`, `value_50k_to_99999_pct` | `DP04_0082E`, `DP04_0082PE` | Owner-occupied units valued $50,000 to $99,999 |
| `value_100k_to_149999`, `value_100k_to_149999_pct` | `DP04_0083E`, `DP04_0083PE` | Owner-occupied units valued $100,000 to $149,999 |
| `value_150k_to_199999`, `value_150k_to_199999_pct` | `DP04_0084E`, `DP04_0084PE` | Owner-occupied units valued $150,000 to $199,999 |
| `value_200k_to_299999`, `value_200k_to_299999_pct` | `DP04_0085E`, `DP04_0085PE` | Owner-occupied units valued $200,000 to $299,999 |
| `value_300k_to_499999`, `value_300k_to_499999_pct` | `DP04_0086E`, `DP04_0086PE` | Owner-occupied units valued $300,000 to $499,999 |
| `value_500k_to_999999`, `value_500k_to_999999_pct` | `DP04_0087E`, `DP04_0087PE` | Owner-occupied units valued $500,000 to $999,999 |
| `value_1m_plus`, `value_1m_plus_pct` | `DP04_0088E`, `DP04_0088PE` | Owner-occupied units valued $1,000,000 or more |
| `median_home_value` | `DP04_0089E` | Median owner-occupied unit value in dollars |
| `rent_paying_units` | `DP04_0126E` | Occupied units paying rent |
| `rent_under_500`, `rent_under_500_pct` | `DP04_0127E`, `DP04_0127PE` | Renter units with gross rent below $500 |
| `rent_500_to_999`, `rent_500_to_999_pct` | `DP04_0128E`, `DP04_0128PE` | Renter units with gross rent $500 to $999 |
| `rent_1000_to_1499`, `rent_1000_to_1499_pct` | `DP04_0129E`, `DP04_0129PE` | Renter units with gross rent $1,000 to $1,499 |
| `rent_1500_to_1999`, `rent_1500_to_1999_pct` | `DP04_0130E`, `DP04_0130PE` | Renter units with gross rent $1,500 to $1,999 |
| `rent_2000_to_2499`, `rent_2000_to_2499_pct` | `DP04_0131E`, `DP04_0131PE` | Renter units with gross rent $2,000 to $2,499 |
| `rent_2500_to_2999`, `rent_2500_to_2999_pct` | `DP04_0132E`, `DP04_0132PE` | Renter units with gross rent $2,500 to $2,999 |
| `rent_3000_plus`, `rent_3000_plus_pct` | `DP04_0133E`, `DP04_0133PE` | Renter units with gross rent $3,000 or more |
| `median_gross_rent` | `DP04_0134E` | Median gross rent in dollars |
| `no_rent_paid`, `no_rent_paid_pct` | `DP04_0135E`, `DP04_0135PE` | Occupied units in the gross-rent section with no rent paid |
| `value_500k_plus`, `value_500k_plus_pct` | Derived from `DP04_0087` + `DP04_0088` buckets | Owner-occupied units valued $500,000 or more |
| `rent_2500_plus`, `rent_2500_plus_pct` | Derived from `DP04_0132` + `DP04_0133` buckets | Renter units with gross rent $2,500 or more |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level value or rent estimates as evidence about any specific home, owner, renter, parcel, lease, sale, address, occupancy state, wealth level, or residence.
- Do not combine these metrics with individual profiles to infer personal movement, housing cost, ownership, wealth, occupancy, or current residence.

Assumptions:

- `value_500k_plus` is a Bay Area-focused rollup that groups the $500,000 to $999,999 and $1,000,000-or-more owner-value buckets.
- `rent_2500_plus` is a Bay Area-focused rollup that groups the $2,500 to $2,999 and $3,000-or-more gross-rent buckets.
- The adapter preserves all original Census value and rent buckets used in those rollups.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived rollups are `null` only when both source buckets are unavailable.

## U.S. Census ACS 5-Year Vacancy Status

Origin: U.S. Census Bureau American Community Survey 5-year detailed table `B25004`, "Vacancy Status."

Adapter: `lib/sources/census-acs-vacancy-status.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-vacancy-status -- --config=configs/housing-stock-sources/census-acs-vacancy-status-2024-bay-area.json
CENSUS_API_KEY=... npm run ingest:census-acs-vacancy-status -- --config=configs/housing-stock-sources/census-acs-vacancy-status-2024-nyc.json
CENSUS_API_KEY=... npm run ingest:census-acs-vacancy-status -- --config=configs/housing-stock-sources/census-acs-vacancy-status-2024-greater-seattle.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/housing-stock-sources/census-acs-vacancy-status-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |
| `configs/housing-stock-sources/census-acs-vacancy-status-2024-nyc.json` | Bronx, Kings, New York, Queens, Richmond | County |
| `configs/housing-stock-sources/census-acs-vacancy-status-2024-greater-seattle.json` | King, Pierce, Snohomish | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_vacant_units` | `B25004_001E` | Total vacant units |
| `for_rent_units`, `for_rent_pct` | `B25004_002E`, derived share | Vacant units for rent |
| `rented_not_occupied_units`, `rented_not_occupied_pct` | `B25004_003E`, derived share | Rented but not occupied units |
| `for_sale_only_units`, `for_sale_only_pct` | `B25004_004E`, derived share | Vacant units for sale only |
| `sold_not_occupied_units`, `sold_not_occupied_pct` | `B25004_005E`, derived share | Sold but not occupied units |
| `seasonal_recreational_occasional_units`, `seasonal_recreational_occasional_pct` | `B25004_006E`, derived share | Seasonal, recreational, or occasional-use vacant units |
| `migrant_worker_units`, `migrant_worker_pct` | `B25004_007E`, derived share | Vacant units for migrant workers |
| `other_vacant_units`, `other_vacant_pct` | `B25004_008E`, derived share | Other vacant units |

Update frequency: ACS 5-year estimates are released annually. The current configs use the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Usage restrictions:

- The Census API requires an API key for data requests.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level vacancy-status estimates as evidence about any specific address, owner, household, or occupancy state.
- Do not combine these metrics with individual profiles to infer personal movement, occupancy, or current residence.

Assumptions:

- Vacancy status helps distinguish available vacant units from seasonal or other vacant inventory, which can affect interpretation of mobility pressure.
- Percentage fields are derived by dividing each B25004 category by `B25004_001E` total vacant units.
- The adapter uses ACS detailed table `B25004` rather than DP04 because the DP04 profile table does not expose vacancy-status composition.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`; derived percentages are `null` when either the category or total vacant denominator is unavailable.
