# Source Adapter Workflow

This project does not scrape arbitrary public-record websites. Every source adapter must start from an approved source configuration.

## Approved Collection Paths

1. Official bulk file.
2. Official API.
3. Records-request export.
4. Licensed provider file.
5. HTML collection only when automated access and reuse are explicitly allowed.

## Local CSV Import

Use a CSV with these columns:

```csv
profile_id,source_record_id,full_name,age_range,confidence,aliases,street,city,state,zip,location_kind,phones,emails,relationships
```

List fields use `|` or `;` separators.

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

## CMS NPPES NPI Registry Adapter

The NPPES adapter uses the official CMS NPI Registry API to ingest limited active individual provider records. It maps professional/business addresses and phone numbers into local profiles with raw NPI records stored as provenance.

Run:

```bash
npm run ingest:nppes -- --last=Smith --first=John --state=CA --limit=10
```

Or fetch by NPI:

```bash
npm run ingest:nppes -- --npi=1234567890
```

Important constraints:

- Use this as professional/provider directory data, not residential people-search data.
- The adapter only imports active individual providers (`NPI-1`, status `A`).
- NPPES data remains governed by CMS/NPPES publication rules; local opt-out suppression only controls whether this app republishes a profile.

