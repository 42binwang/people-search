# Aggregate Housing Assistance Sources

Housing assistance metrics are privacy-compliant residential context signals. They
help show where subsidized rental assistance is concentrated without importing
tenant identities, exact participant addresses, landlord records, or
household-level rows.

Adapters:

- `lib/sources/hud-housing-choice-vouchers.ts`
- `lib/sources/hud-public-housing-buildings.ts`
- `lib/sources/hud-lihtc-properties.ts`
- `lib/sources/hud-qualified-census-tracts.ts`
- `lib/sources/hud-difficult-development-areas.ts`
- `lib/sources/hud-small-area-fair-market-rents.ts`
- `lib/sources/hud-fair-market-rents.ts`

CLI:

```bash
npx tsx scripts/ingest-hud-housing-choice-vouchers.ts -- --config=configs/housing-assistance-sources/hud-hcv-2025-bay-area.json
npx tsx scripts/ingest-hud-public-housing-buildings.ts -- --config=configs/housing-assistance-sources/hud-public-housing-buildings-2025-bay-area.json
npx tsx scripts/ingest-hud-lihtc-properties.ts -- --config=configs/housing-assistance-sources/hud-lihtc-properties-bay-area.json
npx tsx scripts/ingest-hud-qualified-census-tracts.ts -- --config=configs/housing-assistance-sources/hud-qct-2026-bay-area.json
npx tsx scripts/ingest-hud-difficult-development-areas.ts -- --config=configs/housing-assistance-sources/hud-dda-2026-bay-area.json
npx tsx scripts/ingest-hud-small-area-fair-market-rents.ts -- --config=configs/housing-assistance-sources/hud-safmr-2026-bay-area.json
npx tsx scripts/ingest-hud-fair-market-rents.ts -- --config=configs/housing-assistance-sources/hud-fmr-2026-bay-area.json
```

Current configs:

| Config | Origin | Coverage | Selected Fields | Stored Aggregates |
| --- | --- | --- | --- | --- |
| `hud-hcv-2025-bay-area.json` | HUD Open Data / Housing Choice Vouchers by Tract | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma counties | `GEOID`, `STATE`, `COUNTY`, `TRACT`, `EANAME`, `HCV_PUBLIC`, `HCV_PUBLIC_PCT` | Census-tract voucher count and voucher share |
| `hud-public-housing-buildings-2025-bay-area.json` | HUD Open Data / Public Housing Buildings | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma counties | `STATE2KX`, `CNTY2KX`, `CNTY_NM2KX`, `TOTAL_DWELLING_UNITS`, `TOTAL_UNITS`, `TOTAL_OCCUPIED`, `REGULAR_VACANT`, `NUMBER_REPORTED`, `PEOPLE_TOTAL`, `PCT_OCCUPIED` | County public-housing building count, unit totals, occupancy totals, and average occupancy rate |
| `hud-lihtc-properties-bay-area.json` | HUD Open Data / Low-Income Housing Tax Credit Properties | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma counties | `STATE2KX`, `CNTY2KX`, `CNTY_NM2KX`, `N_UNITS`, `LI_UNITS`, bedroom-count fields, `ALLOCAMT`, `YR_PIS`, `YR_ALLOC` | County LIHTC project count, unit totals, low-income unit totals, bedroom mix, allocation amount, and year ranges |
| `hud-qct-2026-bay-area.json` | HUD Open Data / Qualified Census Tracts 2026 | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma counties | `GEOID`, `STATE`, `COUNTY`, `TRACT`, `NAME` | County count of LIHTC Qualified Census Tracts |
| `hud-dda-2026-bay-area.json` | HUD Open Data / Difficult Development Areas 2026 | Bay Area-related HUD FMR/MSA areas: Napa, Oakland-Fremont, San Francisco, San Jose-Sunnyvale-Santa Clara, Santa Rosa-Petaluma, and Vallejo | `ZCTA5`, `DDA_CODE`, `DDA_TYPE`, `DDA_NAME` | HUD FMR/MSA area count of LIHTC Difficult Development Area ZCTAs |
| `hud-safmr-2026-bay-area.json` | HUD Open Data / Small Area Fair Market Rents 2026 | Bay Area-related HUD FMR/MSA areas: Napa, Oakland-Fremont, San Francisco, San Jose-Sunnyvale-Santa Clara, Santa Rosa-Petaluma, and Vallejo | `HUD_CODE`, `FMR_NAME`, `ID`, `ZCTA_ID`, SAFMR rent fields, and 90%/110% payment-standard fields | ZIP/ZCTA-level SAFMR rent and payment-standard metrics by HUD FMR/MSA area |
| `hud-fmr-2026-bay-area.json` | HUD Open Data / Fair Market Rents 2026 | Bay Area-related HUD FMR/MSA areas: Napa, Oakland-Fremont, San Francisco, San Jose-Sunnyvale-Santa Clara, Santa Rosa-Petaluma, and Vallejo | `FMR_CODE`, `FMR_AREANAME`, `FMR_0BDR`, `FMR_1BDR`, `FMR_2BDR`, `FMR_3BDR`, `FMR_4BDR` | Area-level Fair Market Rent values by bedroom count |

Primary source links:

- HUD dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::housing-choice-vouchers-by-tract/about
- HUD ArcGIS FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Housing_Choice_Vouchers_by_Tract/FeatureServer/0
- HUD public housing buildings dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::public-housing-buildings/about
- HUD public housing buildings FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Public_Housing_Buildings/FeatureServer/0
- HUD LIHTC properties dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::low-income-housing-tax-credit-properties/about
- HUD LIHTC properties FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0
- HUD Qualified Census Tracts dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026/about
- HUD Qualified Census Tracts FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0
- HUD Difficult Development Areas dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::difficult-development-areas-2026/about
- HUD Difficult Development Areas FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/DIFFICULT_DEVELOPMENT_AREAS_2026/FeatureServer/0
- HUD Small Area Fair Market Rents dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::small-area-fair-market-rents/about
- HUD Small Area Fair Market Rents FeatureServer table: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer/1
- HUD Fair Market Rents dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::fair-market-rents/about
- HUD Fair Market Rents FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Fair_Market_Rents/FeatureServer/0
- HUD Housing Choice Voucher program: https://www.hud.gov/program_offices/public_indian_housing/programs/hcv/about/
- HUD Public Housing program: https://www.hud.gov/program_offices/public_indian_housing/programs/ph/
- HUD LIHTC dataset page: https://www.huduser.gov/portal/datasets/lihtc.html
- HUD QCT/DDA dataset page: https://www.huduser.gov/portal/datasets/qct.html

Source privacy properties:

- HUD describes this as tract-level aggregate public data.
- HUD notes that public HCV locations are identified by owner, not tenant.
- HUD notes that public participant-location data is available only as Census
  tract aggregations.
- HUD omits tracts containing 10 or fewer voucher holders.
- HUD public housing building metadata says building characteristics are
  suppressed with `-4` when `Number_Reported` is 10 or fewer.
- The public-housing adapter aggregates selected non-address fields to county
  metrics before storage.
- HUD describes the LIHTC database as a national source of project size, unit
  mix, and location; the LIHTC adapter stores only county aggregate inventory
  metrics.
- HUD defines Qualified Census Tracts for LIHTC as tracts meeting income or
  poverty thresholds; the QCT adapter stores only county aggregate tract counts.
- HUD defines metropolitan Difficult Development Areas along Census ZCTA
  boundaries; the DDA adapter stores only aggregate ZCTA counts by HUD FMR/MSA
  label.
- HUD describes Small Area Fair Market Rents as FMRs calculated for ZIP Codes
  within metropolitan areas. The SAFMR adapter stores only HUD rent and payment
  standard values by ZIP/ZCTA and HUD FMR/MSA label.
- HUD describes Fair Market Rents as area-level estimated rent plus essential
  utilities. The FMR adapter stores only configured HUD FMR/MSA area rent values
  by bedroom count.

Usage restrictions:

- Use these metrics only as aggregate housing-assistance context.
- Do not join voucher metrics to individual profiles to infer benefit status,
  residence, landlord relationship, income, disability, age, household
  composition, or exact address.
- Do not request geometry, names, owners, addresses, participant identifiers, or
  household-level data.
- Do not request public-housing building addresses, agency contacts, lat/lon,
  project names, building names, participant names, or resident demographic
  fields.
- Do not request LIHTC project names, project addresses, contact names, company
  names, company addresses, phone numbers, standardized addresses, lat/lon,
  geometry, or block-level geocoding fields.
- Do not request QCT geometry or attempt to infer individual household income,
  poverty status, housing eligibility, residence, or address from QCT metrics.
- Do not request DDA geometry, addresses, parcel records, owner records, or
  resident records, and do not infer individual household income, housing
  eligibility, residence, or address from DDA metrics.
- Do not request SAFMR geometry, addresses, parcel records, owner records, or
  resident records, and do not infer any person's actual rent, voucher payment,
  benefit status, residence, or address from SAFMR metrics.
- Do not request FMR geometry, addresses, parcel records, owner records, or
  resident records, and do not infer any person's actual rent, voucher payment,
  benefit status, residence, or address from FMR metrics.
- Display the source coverage period because HUD refresh cadence may differ
  from local county data.

Assumptions:

- Census-tract aggregation is the right first granularity for Bay Area housing
  assistance context because it is materially more local than county totals while
  preserving HUD's suppression/privacy safeguards.
- County aggregation is the right first granularity for public-housing building
  inventory because the source includes facility-level location/contact fields
  that are unnecessary for people-search context.
- County aggregation is the right first granularity for LIHTC properties because
  the source includes project-level address/contact fields that are unnecessary
  for people-search context.
- County aggregation is the right first granularity for QCTs because the source
  is a tract designation layer and the product currently uses county-level Bay
  Area context signals.
- HUD FMR/MSA area aggregation is the right first granularity for metropolitan
  DDAs because HUD's source uses ZCTA designations and FMR/MSA labels rather
  than county labels.
- ZIP/ZCTA granularity is acceptable for SAFMR because HUD publishes the values
  as official ZIP-level rent/payment-standard estimates and the table contains
  no person, household, parcel, owner, or exact address records.
- Area-level FMR values are useful as a baseline companion to SAFMR because they
  provide the broader HUD FMR/MSA rent benchmark for the same Bay Area labels.
- The first implementation covers the nine Bay Area counties for county/tract
  sources and Bay Area-related HUD FMR/MSA labels for DDA and SAFMR sources.

Failure handling:

- Non-OK ArcGIS responses fail with status and status text.
- Non-JSON responses fail explicitly.
- ArcGIS error payloads fail explicitly.
- Missing required fields fail explicitly so configs cannot silently import a
  changed layer.
- Nonnumeric or suppressed count/percentage fields are stored as `null`.
- Public-housing suppressed `-4` values are excluded from county sums and
  averages.
- LIHTC negative, blank, malformed, or out-of-range numeric/year fields are
  excluded from county sums and year ranges.
- DDA duplicate ZCTA rows within the same HUD FMR/MSA label are counted once.
- SAFMR malformed or unavailable rent/payment-standard values are stored as
  `null`, and each ZCTA/FMR-area relationship is keyed independently because
  some ZCTAs overlap multiple HUD FMR areas.
- FMR malformed or unavailable rent values are stored as `null`.
