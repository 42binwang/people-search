# Search People

AI-based, ad-supported public lookup website for finding possible people, phone, email, and address records from lawful public or licensed data sources.

The project requirements and implementation checklist live in [docs/requirements.md](docs/requirements.md).
Coding-agent rules live in [AGENTS.md](AGENTS.md).
The source inventory and ranked roadmap live in [docs/data-sources.md](docs/data-sources.md).

## Product Direction

- AI-based public lookup site monetized with display ads.
- Search modes: name, phone, email, and address.
- Strong privacy, opt-out, abuse prevention, and FCRA guardrails from day one.
- No paid reports in the MVP.

## Current Status

- Requirements captured.
- Next.js prototype implemented.
- Local SQLite storage, DB-backed search, seed data, approved-source CSV import, and opt-out suppression workflow are implemented.

## Local Development

```bash
npm install
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000.

Useful commands:

- `npm run db:seed` seeds synthetic local development records.
- `npm run ingest:csv -- data/imports/example.csv approved_source_id` imports an approved CSV source.
- `npm run ingest:nppes -- --last=Smith --first=John --state=CA` imports limited CMS NPPES provider records.
- `npm run ingest:fec -- --query="Jane Smith"` imports federal candidate context from OpenFEC.
- `npm run ingest:federal-register -- --query="Jane Smith"` imports Federal Register document-mention context.
- `npm run ingest:openalex -- --query="Jane Smith"` imports scholarly author context from OpenAlex.
- `npm run ingest:wikidata -- --query="Jane Smith"` imports public-knowledge entity context from Wikidata.
- `npm run ingest:crossref -- --query="Jane Smith"` imports scholarly work author mentions from Crossref.
- `npm run ingest:clinical-trials -- --query="Jane Smith"` imports matching clinical trial personnel from ClinicalTrials.gov.
- `npm run ingest:datacite -- --query="Jane Smith"` imports research output creator mentions from DataCite.
- `npm run ingest:pubmed -- --query="Jane Smith"` imports PubMed author mentions from NCBI E-utilities.
- `npm run ingest:internet-archive -- --query="Jane Smith"` imports creator metadata from Internet Archive item search.
- `npm run ingest:arxiv -- --query="Jane Smith"` imports arXiv preprint author metadata.
- `npm run ingest:open-library -- --query="Jane Smith"` imports Open Library author metadata.
- `npm run ingest:library-of-congress -- --query="Jane Smith"` imports Library of Congress authority/catalog search context.
- `npm run ingest:github -- --query="Jane Smith"` imports public GitHub developer profile context.
- `npm run ingest:stack-exchange -- --query="Jane Smith" --site=stackoverflow` imports public Stack Exchange Q&A profile context.
- `npm run ingest:viaf -- --query="Mark Twain"` imports VIAF library authority metadata.
- `npm run ingest:musicbrainz -- --query="Taylor Swift"` imports MusicBrainz artist metadata.
- `npm run ingest:orcid -- --query="Jane Smith"` imports ORCID public researcher identifier metadata.
- `npm run ingest:semantic-scholar -- --query="Jane Smith"` imports Semantic Scholar author metadata.
- `npm run ingest:google-books -- --query="Jane Smith"` imports Google Books catalog author metadata.
- `npm run ingest:europe-pmc -- --query="Jane Smith"` imports Europe PMC publication author metadata.
- `npm run ingest:socrata -- --config=configs/county-parcel-socrata.json --query="Jane Smith"` imports approved Socrata/SODA open-data rows.
- `npm run ingest:arcgis -- --config=configs/county-parcel-arcgis.json --query="Jane Smith"` imports approved ArcGIS FeatureServer rows.
- `npm run ingest:ckan -- --config=configs/county-parcel-ckan.json --query="Jane Smith"` imports approved CKAN DataStore rows.
- `npm run ingest:opendatasoft -- --config=configs/county-parcel-opendatasoft.json --query="Jane Smith"` imports approved Opendatasoft Explore API rows.
- `npm run ingest:official-json -- --config=configs/county-parcel-json.json --query="Jane Smith"` imports approved custom official JSON API rows.
- `npm run ingest:official-delimited -- --config=configs/county-parcel-csv.json --query="Jane Smith"` imports approved official CSV/TSV/pipe-delimited bulk rows.
- `npm run ingest:official-xml -- --config=configs/county-parcel-xml.json --query="Jane Smith"` imports approved official XML API/feed rows.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-mobility.ts -- --config=configs/mobility-sources/census-acs-2024-bay-area.json` imports aggregate Census ACS county mobility estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts -- --config=configs/housing-stock-sources/census-acs-2024-bay-area.json` imports aggregate Census ACS county housing stock and vacancy estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-vacancy-status.ts -- --config=configs/housing-stock-sources/census-acs-vacancy-status-2024-bay-area.json` imports aggregate Census ACS vacant-unit status composition.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts-cost-burden -- --config=configs/housing-stock-sources/census-acs-cost-burden-2024-bay-area.json` imports aggregate Census ACS owner and renter housing cost-burden estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts-crowding -- --config=configs/housing-stock-sources/census-acs-crowding-2024-bay-area.json` imports aggregate Census ACS occupants-per-room housing crowding estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-housing.ts-structure -- --config=configs/housing-stock-sources/census-acs-housing-structure-2024-bay-area.json` imports aggregate Census ACS Bay Area housing structure and year-built estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-value-rent.ts -- --config=configs/housing-stock-sources/census-acs-value-rent-2024-bay-area.json` imports aggregate Census ACS Bay Area owner-value and gross-rent distribution estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-household-composition.ts -- --config=configs/housing-stock-sources/census-acs-household-composition-2024-bay-area.json` imports aggregate Census ACS Bay Area household-composition estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-commuting.ts -- --config=configs/mobility-sources/census-acs-commuting-2024-bay-area.json` imports aggregate Census ACS county commuting mode, work-from-home, and travel-time estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-age-sex.ts -- --config=configs/social-sources/census-acs-age-sex-2024-bay-area.json` imports aggregate Census ACS Bay Area age and sex distribution estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-educational-attainment.ts -- --config=configs/economic-sources/census-acs-educational-attainment-2024-bay-area.json` imports aggregate Census ACS Bay Area educational-attainment estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-employment-status.ts -- --config=configs/economic-sources/census-acs-employment-status-2024-bay-area.json` imports aggregate Census ACS Bay Area employment-status estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-internet-access.ts -- --config=configs/social-sources/census-acs-internet-access-2024-bay-area.json` imports aggregate Census ACS Bay Area household computer and broadband access estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-language-proficiency.ts -- --config=configs/social-sources/census-acs-language-proficiency-2024-bay-area.json` imports aggregate Census ACS Bay Area language-at-home and English-proficiency estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-race-origin.ts -- --config=configs/social-sources/census-acs-race-origin-2024-bay-area.json` imports aggregate Census ACS Bay Area race and Hispanic or Latino origin estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-household-income.ts -- --config=configs/economic-sources/census-acs-household-income-2024-bay-area.json` imports aggregate Census ACS Bay Area household-income distribution estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-health-insurance.ts -- --config=configs/economic-sources/census-acs-health-insurance-2024-bay-area.json` imports aggregate Census ACS Bay Area health-insurance coverage estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-poverty-assistance.ts -- --config=configs/economic-sources/census-acs-poverty-assistance-2024-bay-area.json` imports aggregate Census ACS Bay Area poverty, cash public assistance, and SNAP estimates.
- `npx tsx scripts/ingest-bls-laus-county-labor.ts -- --config=configs/economic-sources/bls-laus-county-labor-2024-2026-bay-area.json` imports aggregate BLS LAUS monthly county labor force, employment, unemployment, and unemployment-rate estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-cbp-county-business.ts -- --config=configs/economic-sources/census-cbp-county-business-2023-bay-area.json` imports aggregate Census County Business Patterns all-sector establishments, employment, and annual payroll.
- `npx tsx scripts/ingest-hud-low-moderate-income-block-groups.ts -- --config=configs/economic-sources/hud-low-mod-income-bg-2020-bay-area.json` imports HUD low/moderate income population block-group data rolled up to Bay Area county metrics.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-residential-tenure.ts -- --config=configs/mobility-sources/census-acs-residential-tenure-2024-bay-area.json` imports aggregate Census ACS county year-moved-into-unit estimates.
- `CENSUS_API_KEY=... npx tsx scripts/ingest-census-acs-migration-flows.ts -- --config=configs/mobility-sources/census-acs-flows-2022-bay-area.json` imports aggregate Census ACS county migration-flow estimates.
- `npx tsx scripts/ingest-census-pep-components.ts -- --config=configs/mobility-sources/census-pep-2025-bay-area.json` imports aggregate Census PEP annual county population-change components.
- `npx tsx scripts/ingest-census-lehd-lodes.ts -- --config=configs/mobility-sources/census-lehd-lodes-2023-bay-area.json` imports aggregate Census LEHD LODES county-pair residence-work commute flows.
- `npx tsx scripts/ingest-irs-soi-migration.ts -- --config=configs/mobility-sources/irs-soi-2022-2023-bay-area.json` imports aggregate IRS SOI county migration inflow/outflow metrics.
- `npx tsx scripts/ingest-socrata-housing-permits.ts -- --config=configs/housing-permit-sources/seattle-issued-building-permits.json` imports monthly aggregate residential permit activity from selected non-personal Socrata fields.
- `npx tsx scripts/ingest-hud-residential-construction-permits.ts -- --config=configs/housing-permit-sources/hud-bps-2022-bay-area.json` imports annual aggregate residential construction permit totals for all nine Bay Area counties.
- `npx tsx scripts/ingest-hud-housing-choice-vouchers.ts -- --config=configs/housing-assistance-sources/hud-hcv-2025-bay-area.json` imports aggregate HUD Housing Choice Voucher counts by Census tract for all nine Bay Area counties.
- `npx tsx scripts/ingest-hud-public-housing-buildings.ts -- --config=configs/housing-assistance-sources/hud-public-housing-buildings-2025-bay-area.json` imports aggregate HUD public housing building inventory by county for all nine Bay Area counties.
- `npx tsx scripts/ingest-hud-lihtc-properties.ts -- --config=configs/housing-assistance-sources/hud-lihtc-properties-bay-area.json` imports aggregate HUD Low-Income Housing Tax Credit property inventory by county for all nine Bay Area counties.
- `npx tsx scripts/ingest-hud-qualified-census-tracts.ts -- --config=configs/housing-assistance-sources/hud-qct-2026-bay-area.json` imports aggregate HUD LIHTC Qualified Census Tract counts by county for all nine Bay Area counties.
- `npx tsx scripts/ingest-hud-difficult-development-areas.ts -- --config=configs/housing-assistance-sources/hud-dda-2026-bay-area.json` imports aggregate HUD LIHTC Difficult Development Area ZCTA counts by Bay Area-related HUD FMR/MSA area.
- `npx tsx scripts/ingest-hud-small-area-fair-market-rents.ts -- --config=configs/housing-assistance-sources/hud-safmr-2026-bay-area.json` imports HUD Small Area Fair Market Rent ZIP/ZCTA rent and payment-standard metrics for Bay Area-related HUD FMR/MSA areas.
- `npx tsx scripts/ingest-hud-fair-market-rents.ts -- --config=configs/housing-assistance-sources/hud-fmr-2026-bay-area.json` imports HUD Fair Market Rent area-level rent metrics for Bay Area-related HUD FMR/MSA areas.
- `npm run collect:source -- configs/source.json` fetches an approved source payload into ignored raw storage.
- `npm run sources:validate-property` verifies real property-source candidate configs against live source metadata without importing records.
- `docs/bay-area-property-sources.md` tracks official property-source status for Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, and Sonoma counties.
- `docs/aggregate-mobility-sources.md` tracks aggregate Census ACS, IRS SOI, Census PEP, and Census LEHD LODES mobility/context sources for Bay Area, New York City, and Greater Seattle.
- `docs/aggregate-housing-permit-sources.md` tracks aggregate residential permit sources for San Francisco, New York City, Seattle, and county-level HUD/Census BPS coverage for all configured hubs.
- `docs/aggregate-housing-assistance-sources.md` tracks aggregate HUD Housing Choice Voucher, public housing inventory, LIHTC inventory, and Qualified Census Tract sources for Bay Area counties.
- `docs/aggregate-housing-stock-sources.md` tracks aggregate ACS housing stock, occupancy, vacancy, tenure, value, rent, cost-burden, crowding, structure, age, and household-composition sources.
- `docs/aggregate-economic-sources.md` tracks aggregate ACS household-income sources for Bay Area counties.
- `npm run lint` checks code style.
- `npm run test` runs unit tests.
- `npm run build` verifies a production build.

Most source ingesters do not send a source-side result cap by default. Add `--limit=n` only when you want a bounded local smoke run or an explicit import cap.

Name searches check built-in approved source adapters on every search unless that specific source has already been refreshed for the same hashed, normalized query within the last hour. Set `NAME_SOURCE_REFRESH_TTL_SECONDS` to override the one-hour source refresh window, and `NAME_SOURCE_REFRESH_TIMEOUT_SECONDS` to override the 15-second per-source timeout.

Phone, email, and address result IDs are cached in the local SQLite database by a hashed, normalized query key. Set `SEARCH_RESULT_CACHE_TTL_SECONDS` to control that result-cache TTL; the default is 30 minutes.
