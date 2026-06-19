# Aggregate Social Sources

This document tracks approved aggregate social-context sources. These sources are not people-search profile records. They must stay separated from individual profiles and must not be used to infer sensitive traits about a specific person, household, address, or resident.

## U.S. Census ACS 5-Year Race and Hispanic Origin

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP05`, "ACS Demographic and Housing Estimates."

Adapter: `lib/sources/census-acs-race-origin.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-race-origin -- --config=configs/social-sources/census-acs-race-origin-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/social-sources/census-acs-race-origin-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `race_total_population` | `DP05_0033E` | Total population for race table |
| `white`, `white_pct` | `DP05_0037E`, `DP05_0037PE` | One race: White |
| `black`, `black_pct` | `DP05_0045E`, `DP05_0045PE` | One race: Black or African American |
| `american_indian_alaska_native`, `american_indian_alaska_native_pct` | `DP05_0053E`, `DP05_0053PE` | One race: American Indian and Alaska Native |
| `asian`, `asian_pct` | `DP05_0061E`, `DP05_0061PE` | One race: Asian |
| `native_hawaiian_pacific_islander`, `native_hawaiian_pacific_islander_pct` | `DP05_0069E`, `DP05_0069PE` | One race: Native Hawaiian and Other Pacific Islander |
| `some_other_race`, `some_other_race_pct` | `DP05_0074E`, `DP05_0074PE` | One race: Some Other Race |
| `two_or_more_races`, `two_or_more_races_pct` | `DP05_0035E`, `DP05_0035PE` | Two or More Races |
| `hispanic_latino`, `hispanic_latino_pct` | `DP05_0090E`, `DP05_0090PE` | Hispanic or Latino of any race |
| `not_hispanic_latino`, `not_hispanic_latino_pct` | `DP05_0095E`, `DP05_0095PE` | Not Hispanic or Latino |
| `white_non_hispanic`, `white_non_hispanic_pct` | `DP05_0096E`, `DP05_0096PE` | Not Hispanic or Latino: White alone |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

Usage restrictions:

- Use this source only for aggregate county-level demographic context.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level race or origin estimates as evidence about any specific person, household, address, protected-class attribute, national origin, identity attribute, benefit status, or eligibility.
- Do not combine these metrics with individual profiles to infer race, ethnicity, national origin, residence, household composition, identity attributes, income, or eligibility.
- Do not import detailed ancestry or subgroup rows from DP05 into people-search profile records.

## U.S. Census ACS 5-Year Age and Sex Distribution

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP05`, "ACS Demographic and Housing Estimates."

Adapter: `lib/sources/census-acs-age-sex.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-age-sex -- --config=configs/social-sources/census-acs-age-sex-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/social-sources/census-acs-age-sex-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_population` | `DP05_0001E` | Total population |
| `male`, `male_pct` | `DP05_0002E`, `DP05_0002PE` | Male population count and percent |
| `female`, `female_pct` | `DP05_0003E`, `DP05_0003PE` | Female population count and percent |
| `sex_ratio` | `DP05_0004E` | Males per 100 females |
| `under_5`, `under_5_pct` | `DP05_0005E`, `DP05_0005PE` | Population under 5 years |
| `age_5_to_9`, `age_5_to_9_pct` | `DP05_0006E`, `DP05_0006PE` | Population age 5 to 9 |
| `age_10_to_14`, `age_10_to_14_pct` | `DP05_0007E`, `DP05_0007PE` | Population age 10 to 14 |
| `age_15_to_19`, `age_15_to_19_pct` | `DP05_0008E`, `DP05_0008PE` | Population age 15 to 19 |
| `age_20_to_24`, `age_20_to_24_pct` | `DP05_0009E`, `DP05_0009PE` | Population age 20 to 24 |
| `age_25_to_34`, `age_25_to_34_pct` | `DP05_0010E`, `DP05_0010PE` | Population age 25 to 34 |
| `age_35_to_44`, `age_35_to_44_pct` | `DP05_0011E`, `DP05_0011PE` | Population age 35 to 44 |
| `age_45_to_54`, `age_45_to_54_pct` | `DP05_0012E`, `DP05_0012PE` | Population age 45 to 54 |
| `age_55_to_59`, `age_55_to_59_pct` | `DP05_0013E`, `DP05_0013PE` | Population age 55 to 59 |
| `age_60_to_64`, `age_60_to_64_pct` | `DP05_0014E`, `DP05_0014PE` | Population age 60 to 64 |
| `age_65_to_74`, `age_65_to_74_pct` | `DP05_0015E`, `DP05_0015PE` | Population age 65 to 74 |
| `age_75_to_84`, `age_75_to_84_pct` | `DP05_0016E`, `DP05_0016PE` | Population age 75 to 84 |
| `age_85_plus`, `age_85_plus_pct` | `DP05_0017E`, `DP05_0017PE` | Population age 85 years and over |
| `median_age` | `DP05_0018E` | Median age in years |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

Usage restrictions:

- Use this source only for aggregate county-level demographic context.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level age or sex estimates as evidence about any specific person, household, address, birth date, identity attribute, benefit status, or eligibility.
- Do not combine these metrics with individual profiles to infer age, sex, residence, household composition, identity attributes, income, or eligibility.

## U.S. Census ACS 5-Year Computer and Internet Access

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP02`, "Selected Social Characteristics in the United States."

Adapter: `lib/sources/census-acs-internet-access.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-internet-access -- --config=configs/social-sources/census-acs-internet-access-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/social-sources/census-acs-internet-access-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `total_households`, `total_households_pct` | `DP02_0152E`, `DP02_0152PE` | Total households |
| `with_computer`, `with_computer_pct` | `DP02_0153E`, `DP02_0153PE` | Households with a computer |
| `with_broadband`, `with_broadband_pct` | `DP02_0154E`, `DP02_0154PE` | Households with a broadband internet subscription |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

Usage restrictions:

- Use this source only for aggregate county-level social and digital-access context.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level computer or broadband access estimates as evidence about any specific person, household, address, device, subscription, IP address, income, benefit status, or eligibility.
- Do not combine these metrics with individual profiles to infer device ownership, internet service, residence, household composition, income, or eligibility.

## U.S. Census ACS 5-Year Language Proficiency

Origin: U.S. Census Bureau American Community Survey 5-year Data Profile `DP02`, "Selected Social Characteristics in the United States."

Adapter: `lib/sources/census-acs-language-proficiency.ts`

CLI:

```bash
CENSUS_API_KEY=... npm run ingest:census-acs-language-proficiency -- --config=configs/social-sources/census-acs-language-proficiency-2024-bay-area.json
```

Current configs:

| Config | Coverage | Geography |
| --- | --- | --- |
| `configs/social-sources/census-acs-language-proficiency-2024-bay-area.json` | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma | County |

Stored fields:

| Stored field | Census variable | Meaning |
| --- | --- | --- |
| `population_5_plus` | `DP02_0112E` | Population age 5 and over |
| `english_only`, `english_only_pct` | `DP02_0113E`, `DP02_0113PE` | Population age 5 and over speaking only English at home |
| `language_other_than_english`, `language_other_than_english_pct` | `DP02_0114E`, `DP02_0114PE` | Population age 5 and over speaking a language other than English at home |
| `limited_english`, `limited_english_pct` | `DP02_0115E`, `DP02_0115PE` | Population age 5 and over speaking a language other than English at home and speaking English less than very well |
| `spanish`, `spanish_pct` | `DP02_0116E`, `DP02_0116PE` | Population age 5 and over speaking Spanish at home |
| `spanish_limited_english`, `spanish_limited_english_pct` | `DP02_0117E`, `DP02_0117PE` | Population age 5 and over speaking Spanish at home and speaking English less than very well |
| `other_indo_european`, `other_indo_european_pct` | `DP02_0118E`, `DP02_0118PE` | Population age 5 and over speaking other Indo-European languages at home |
| `other_indo_european_limited_english`, `other_indo_european_limited_english_pct` | `DP02_0119E`, `DP02_0119PE` | Population age 5 and over speaking other Indo-European languages at home and speaking English less than very well |
| `asian_pacific_islander`, `asian_pacific_islander_pct` | `DP02_0120E`, `DP02_0120PE` | Population age 5 and over speaking Asian and Pacific Islander languages at home |
| `asian_pacific_islander_limited_english`, `asian_pacific_islander_limited_english_pct` | `DP02_0121E`, `DP02_0121PE` | Population age 5 and over speaking Asian and Pacific Islander languages at home and speaking English less than very well |
| `other_languages`, `other_languages_pct` | `DP02_0122E`, `DP02_0122PE` | Population age 5 and over speaking other languages at home |
| `other_languages_limited_english`, `other_languages_limited_english_pct` | `DP02_0123E`, `DP02_0123PE` | Population age 5 and over speaking other languages at home and speaking English less than very well |

Update frequency: ACS 5-year estimates are released annually. The current config uses the 2024 ACS 5-year release, covering data collected from January 1, 2020 through December 31, 2024.

Failure handling:

- Missing `CENSUS_API_KEY` fails before network access.
- Non-OK Census responses fail with status and status text.
- Non-JSON, missing header, missing fields, and empty data rows fail with explicit errors.
- Suppressed or nonnumeric estimate values are stored as `null`.

Usage restrictions:

- Use this source only for aggregate county-level social context.
- Data is aggregate survey-estimate data and should be displayed with source year and geography.
- Do not present county-level language or English-proficiency estimates as evidence about any specific person, household, address, language, national origin, immigration status, education, employment, benefit status, or eligibility.
- Do not combine these metrics with individual profiles to infer language, origin, immigration status, residence, household composition, income, or eligibility.
