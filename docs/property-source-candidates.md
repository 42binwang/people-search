# Property Source Candidates

These are real official county/state property-record sources with validated API metadata and field maps. The current configs are user-approved for local ingestion. Commercial/public republication, ongoing source terms, and protected-address handling remain operator responsibilities.

Run metadata validation:

```bash
npm run sources:validate-property
```

Candidate configs live in `configs/property-sources/`.

Bay Area-specific source registry configs live in `configs/property-sources/bay-area/`. See `docs/bay-area-property-sources.md` for the county-by-county status and the licensed-provider path for all nine Bay Area counties.

| Source ID | Jurisdiction | Adapter | Coverage | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `wi_statewide_parcels_2025` | Wisconsin | ArcGIS | Statewide, all 72 counties | User-approved local ingestion | Official statewide parcel layer. The source says data is provided free of charge; Wisconsin judicial privacy shielding remains an operator responsibility. |
| `cook_county_il_parcel_addresses` | Cook County, IL | Socrata | County | User-approved local ingestion | Official assessor parcel-address dataset with owner and property address fields. |
| `dekalb_county_ga_tax_parcels` | DeKalb County, GA | ArcGIS | County | User-approved local ingestion | Official tax parcel layer with owner, situs, city, state, and ZIP fields. |
| `racine_county_wi_tax_parcels` | Racine County, WI | ArcGIS | County | User-approved local ingestion | Official tax parcel layer. Current config maps owner mailing address fields because site city/state are not separately exposed. |
| `cedar_rapids_ia_parcels` | Cedar Rapids, IA | ArcGIS | City | User-approved local ingestion | Official parcel layer. Current config maps owner mailing address fields because site city/state are not separately exposed. |

Operational checklist before public display:

- Confirm the official source allows automated access, commercial reuse, public republication, and combination with other approved sources.
- Confirm the source's protected-address, judicial privacy, law-enforcement, shelter, minor, and confidential owner rules.
- Confirm mapped address fields are appropriate for display as public-record context and not represented as proof of current residence.
- Confirm source-specific rate limits, pagination requirements, and update cadence.
- Record the terms URL and review date in the config notes.

After approval:

```bash
npm run ingest:arcgis -- --config=configs/property-sources/wi-statewide-parcels-2025.arcgis.json --query="Jane Smith"
npm run ingest:socrata -- --config=configs/property-sources/cook-county-il-parcel-addresses.socrata.json --query="Jane Smith"
```
