# Bay Area Property Sources

This registry covers the nine-county San Francisco Bay Area: Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma.

The important implementation finding is that most Bay Area county sources are not directly importable for name-based people search. Several official sites expose parcel/address lookups, maps, APNs, or property characteristics, but suppress owner names online or provide them only through a paid/licensed export. Those sources are tracked as `reference` configs so we know where to obtain or verify data without scraping pages that are not approved for republication.

Run:

```bash
npm run sources:validate-property -- --dir=configs/property-sources/bay-area
```

| County / Source | Config | Status | Practical Use |
| --- | --- | --- | --- |
| Alameda County | `alameda_county_ca_property_reference` | Reference only | Official property search and open-data entry points; not approved for scraping/import. |
| Contra Costa County | `contra_costa_county_ca_property_reference` | Owner names not published online | Official county page says owner names are not displayed online. |
| Marin County | `marin_county_ca_property_reference` | Parcel lookup only | Official parcel/map lookup; no documented bulk owner-name API. |
| Napa County | `napa_county_ca_property_reference` | Parcel lookup only | Official assessor/GIS references; no approved bulk owner-name endpoint identified. |
| San Francisco County | `san_francisco_county_ca_assessor_roll_reference` | No owner-name field | DataSF assessor roll exposes parcel/property fields but not owner name. |
| San Mateo County | `san_mateo_county_ca_property_reference` | Parcel/GIS reference | Official parcel, GIS, and recorder index references; no approved bulk owner-name endpoint identified. |
| Santa Clara County | `santa_clara_county_ca_property_reference` | Owner names not published online | Official assessor page says owner-name searches and individual owner names are not displayed. |
| Solano County | `solano_county_ca_property_reference` | Licensed attributes not publicly republishable | Public ArcGIS item references owner attributes, but license text says individual sensitive parcel attributes such as owner names cannot be disclosed. |
| Sonoma County | `sonoma_county_ca_property_reference` | Free download excludes owner name | Official Sonoma page says parcel-level data without owner name is downloadable at no cost. |
| ParcelQuest California | `parcelquest_california_property` | Contract required | Licensed provider candidate for owner names and addresses across all California counties, including all nine Bay Area counties. |

Next implementation path:

1. Use official county reference configs for source discovery, records requests, and APN/address context.
2. For public name-based Bay Area people search, negotiate a licensed California property data feed such as ParcelQuest or another provider whose contract explicitly allows ad-supported public display, caching, opt-out suppression, and republication.
3. Add a licensed-provider ingester once the feed schema is available.
4. Keep county reference configs in place for provenance, conflict checks, and future records-request exports.
