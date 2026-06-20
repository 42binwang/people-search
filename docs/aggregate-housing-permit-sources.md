# Aggregate Housing Permit Sources

Housing permit activity is a privacy-compliant companion signal for residential mobility analysis. It does not show where a person moved, but it helps explain changes in housing supply, redevelopment, and likely capacity for local in-migration or displacement pressure.

The Socrata adapter requests only configured non-personal fields from official city datasets and stores monthly aggregates. It does not request or store permit-level street addresses, owners, applicants, contractors, phone numbers, links, latitude/longitude, or free-text personal contact fields.

Adapter: `lib/sources/socrata-housing-permits.ts`

The HUD residential construction permits adapter requests county FIPS, county names, and annual aggregate residential construction permit totals from HUD's public ArcGIS open-data layer. HUD describes the dataset as "Residential Construction Permits by County"; the underlying measure comes from the U.S. Census Building Permits Survey.

Adapter: `lib/sources/hud-residential-construction-permits.ts`

CLI:

```bash
npx tsx scripts/ingest-socrata-housing-permits.ts -- --config=configs/housing-permit-sources/sf-building-permits.json
npx tsx scripts/ingest-socrata-housing-permits.ts -- --config=configs/housing-permit-sources/nyc-dob-permit-issuance.json
npx tsx scripts/ingest-socrata-housing-permits.ts -- --config=configs/housing-permit-sources/seattle-issued-building-permits.json
npx tsx scripts/ingest-hud-residential-construction-permits.ts -- --config=configs/housing-permit-sources/hud-bps-2022-bay-area.json
npx tsx scripts/ingest-hud-residential-construction-permits.ts -- --config=configs/housing-permit-sources/hud-bps-2022-nyc.json
npx tsx scripts/ingest-hud-residential-construction-permits.ts -- --config=configs/housing-permit-sources/hud-bps-2022-greater-seattle.json
```

Current configs:

| Config | Origin | Coverage | Selected Fields | Stored Aggregates |
| --- | --- | --- | --- | --- |
| `sf-building-permits.json` | DataSF Building Permits | San Francisco, Bay Area | `permit_creation_date`, `permit_type_definition`, `proposed_units`, `estimated_cost` | Monthly permit count, proposed units, estimated cost by permit type |
| `nyc-dob-permit-issuance.json` | NYC Open Data DOB Permit Issuance | New York City | `issuance_date`, `job_type` | Monthly residential permit count by job type |
| `seattle-issued-building-permits.json` | City of Seattle Issued Building Permits | Seattle, Greater Seattle | `issueddate`, `permitclassmapped`, `housingunitsadded`, `housingunitsremoved`, `estprojectcost` | Monthly permit count, units added, units removed, net units, estimated cost by permit class |
| `hud-bps-2022-bay-area.json` | HUD Open Data / Census Building Permits Survey | Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma counties | `GEOID`, `STATE`, `COUNTY`, `NAME`, `STATE_NAME`, `ALL_PERMITS_YYYY`, `SINGLE_FAMILY_PERMITS_YYYY`, `ALL_MULTIFAMILY_PERMITS_YYYY` | Annual county all-residential, single-family, and multifamily permit totals |
| `hud-bps-2022-nyc.json` | HUD Open Data / Census Building Permits Survey | Bronx, Kings, New York, Queens, and Richmond counties | `GEOID`, `STATE`, `COUNTY`, `NAME`, `STATE_NAME`, `ALL_PERMITS_YYYY`, `SINGLE_FAMILY_PERMITS_YYYY`, `ALL_MULTIFAMILY_PERMITS_YYYY` | Annual county all-residential, single-family, and multifamily permit totals |
| `hud-bps-2022-greater-seattle.json` | HUD Open Data / Census Building Permits Survey | King, Pierce, and Snohomish counties | `GEOID`, `STATE`, `COUNTY`, `NAME`, `STATE_NAME`, `ALL_PERMITS_YYYY`, `SINGLE_FAMILY_PERMITS_YYYY`, `ALL_MULTIFAMILY_PERMITS_YYYY` | Annual county all-residential, single-family, and multifamily permit totals |

Primary source links:

- HUD dataset page: https://hudgis-hud.opendata.arcgis.com/datasets/HUD::residential-construction-permits-by-county/about
- HUD ArcGIS FeatureServer layer: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Residential_Construction_Permits_by_County/FeatureServer/24
- Census Building Permits Survey: https://www.census.gov/permits
- Census BPS methodology: https://www.census.gov/construction/bps/methodology.html

Update frequency:

- Socrata portal metadata and source agency practices determine exact freshness.
- Seattle's residential permit GIS documentation says the related residential permit layer is updated within two weeks of quarter end.
- The HUD ArcGIS county layer currently exposes annual fields from 1980 through 2022. Refresh the layer metadata before adding later years.
- The ingester is designed for repeat imports; rows are re-aggregated into stable source record IDs by `periodMonth` and category.
- HUD annual county metrics use stable source record IDs by year and county GEOID.

Usage restrictions:

- Use these metrics as aggregate housing-supply context, not as individual movement evidence.
- Do not join permit-level records to person profiles.
- Do not request or store owner, applicant, contractor, phone, address, coordinate, or document-link fields.
- Do not treat HUD/Census county annual permit counts as permit-level or parcel-level evidence.
- Treat unit fields cautiously: cities define permit and unit semantics differently. Config notes identify source-specific assumptions.

Assumptions:

- "Bay Area" city-level monthly permit coverage starts with San Francisco because it has a documented open-data building permit feed. County-level annual residential permit coverage includes all nine Bay Area counties through the HUD/Census BPS layer.
- "New York City" city-level monthly permit coverage uses DOB Permit Issuance and filters `residential = 'YES'`. County-level annual residential permit coverage includes all five borough counties through the HUD/Census BPS layer.
- "Greater Seattle" city-level monthly permit coverage starts with Seattle issued permits and filters for housing unit activity or residential mapped permit classes. County-level annual residential permit coverage includes King, Pierce, and Snohomish counties through the HUD/Census BPS layer.
- Monthly aggregation is sufficient for the first mobility-context implementation.
- Annual county aggregation is sufficient for broad Bay Area supply comparisons across counties.

Failure handling:

- Non-OK Socrata responses fail with status and status text.
- Non-OK HUD ArcGIS responses fail with status and status text.
- Non-JSON or non-array responses fail explicitly.
- ArcGIS error payloads fail explicitly.
- Rows with malformed date values fail explicitly.
- Suppressed or nonnumeric unit/cost values are treated as `null` and excluded from numeric totals.
- Missing required HUD annual fields fail explicitly so configs cannot silently request unavailable years.
