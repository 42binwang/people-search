# Data Sources

Last updated: 2026-06-20

This file is the repo-level inventory and roadmap for source work. It should be updated whenever an adapter, config, approval status, or source-ranking decision changes.

## Status Vocabulary

- `Implemented`: adapter and CLI exist in the codebase.
- `Configured`: at least one source config exists.
- `Approved for local ingestion`: current config is marked approved and can be used locally, subject to operator obligations.
- `Reference only`: source is documented for discovery or manual verification, but not approved/importable.
- `Licensed-provider candidate`: useful source, but contract and allowed use must be confirmed first.
- `Aggregate only`: source contains geography-level statistics and must never be treated as person-level evidence.
- `Blocked/legal review`: do not implement until terms, law, safety, and product use are approved.

## Collection Rules

Approved collection paths:

1. Official API.
2. Official bulk file.
3. Records-request export.
4. Licensed provider feed with explicit rights for caching, ad-supported display, opt-out suppression, and republication.
5. HTML collection only when automated access and reuse are explicitly allowed.

Do not add arbitrary broker scraping, breached/leaked datasets, private social media, children data, sensitive-location data, or regulated screening data.

## Existing Person/Profile Sources

These adapters can create or enrich profile records. Many are identity/context sources, not residential sources.

| Source | Status | Collection method | Preserved information | Coverage / population | People-search value | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CMS NPPES NPI Registry | Implemented, automatic name refresh | Public API | Provider name, credentials, practice/mailing location, phone, taxonomy | U.S. healthcare providers | High for professionals | Good structured identity and address-like fields, but only covers NPI providers. |
| OpenFEC candidates | Implemented, automatic name refresh | Public API | Candidate name, office, party/state context | Federal candidates | Medium | Useful identity context, weak residential coverage. |
| FEC Schedule A individual contributions | Implemented, automatic name refresh (local) | Public API | Contributor name, city/state/ZIP, employer, occupation, contribution dates, committee context, and possible address fields where exposed | U.S. federal political donors | High but sensitive | Local auto-refresh enabled for development; public display still gated pending display-policy review. Political contribution context can be sensitive even when public. |
| Federal Register documents | Implemented, automatic name refresh | Public API | Public document mentions, agencies, publication dates | People named in federal documents | Low/medium | Good provenance context, not residential evidence. |
| ClinicalTrials.gov | Implemented, automatic name refresh | Public API | Study personnel names and trial context | Researchers/clinical trial personnel | Low/medium | Identity context only. |
| GitHub users | Implemented, automatic name refresh | Public API | Username, public profile URL, repo/follower counts, public location text if present, user-published public email when provided | Developers with public GitHub profiles | Medium | User-entered profile location is not a residence. Public email is opt-in/user-published only; never inferred. |
| Stack Exchange users | Implemented, automatic name refresh | Public API | Public display name, reputation/profile context | Public Q&A users | Low | User-entered metadata only. |
| Wikidata entities | Implemented, automatic name refresh | Public API | Public entity names/descriptions | Notable/public entities | Low | Useful for disambiguation, not residential lookup. |
| OpenAlex authors | Implemented, automatic name refresh | Public API | Author name, institution, works/citation counts | Researchers/authors | Low/medium | Institution is not a residential location. |
| ORCID public registry | Implemented, automatic name refresh | Public API | Public researcher identifier and profile metadata | Researchers with public ORCID records | Low/medium | Respect public visibility flags. |
| Semantic Scholar authors | Implemented, automatic name refresh | Public API | Author name, paper/citation/h-index context | Researchers/authors | Low/medium | Identity context only. |
| Crossref works | Implemented, automatic name refresh | Public API | Work author names, DOI/publication context | Publication authors | Low | Catalog context only. |
| DataCite DOIs | Implemented, automatic name refresh | Public API | Creator names and DOI metadata | Research data/software creators | Low | Catalog context only. |
| PubMed | Implemented, automatic name refresh | Public API | Article author names, publication metadata, and structured corresponding-author `<Email>` when present | Biomedical authors | Low | Catalog context only. Only the dedicated structured `<Email>` element is captured; emails embedded in affiliation text are not inferred. |
| Europe PMC | Implemented, automatic name refresh | Public API | Publication author metadata | Biomedical/research authors | Low | Catalog context only. |
| arXiv | Implemented, automatic name refresh | Public API | Preprint author names and paper metadata | Preprint authors | Low | `arXiv, GLOBAL` must not appear as a location. |
| Internet Archive | Implemented, automatic name refresh | Public API | Creator names and item metadata | Archive item creators | Low | `Internet Archive, GLOBAL` must not appear as a location. |
| Open Library | Implemented, automatic name refresh | Public API | Author/book catalog metadata | Authors | Low | Catalog titles must not become person names. |
| Library of Congress | Implemented, automatic name refresh | Public API | Authority/catalog metadata | Authors/public figures/catalog entries | Low | Catalog titles must not become person names. |
| VIAF | Implemented, automatic name refresh | Public API | Library authority identity metadata | Authors/public figures | Low | Authority context only. |
| MusicBrainz | Implemented, automatic name refresh | Public API | Artist identity metadata | Music artists | Low | Not residential evidence. |
| Google Books | Implemented, automatic name refresh | Public API | Book author metadata | Authors | Low | Catalog context only. |

Automatic name refresh sources are listed in `lib/name-source-refresh.ts`.

## Existing Configurable Person/Property Adapters

These adapters ingest approved official or licensed record-shaped datasets when supplied a config.

| Adapter | Status | Best use | Preserved information | Coverage | Notes |
| --- | --- | --- | --- | --- | --- |
| Approved CSV | Implemented | Records-request exports or licensed files | Configured names, phones, emails, addresses, relatives, aliases, raw provenance | Any approved file | Use for manually obtained exports or provider feeds. |
| Socrata/SODA | Implemented | City/county open data portals | Configured owner/applicant/person fields, address fields, source raw data | Depends on portal/dataset | Requires approved config and field map. |
| ArcGIS FeatureServer | Implemented | Parcel, tax, permit, and GIS open data | Configured names and address fields, source raw data | Depends on layer | Requires approved config and metadata validation. |
| CKAN DataStore | Implemented | Official open data portals | Configured person/address fields | Depends on portal/dataset | Requires approved config. |
| Opendatasoft Explore API | Implemented | Official open data portals | Configured person/address fields | Depends on portal/dataset | Requires approved config. |
| Official JSON | Implemented | Custom official JSON APIs | Configured person/address fields | Depends on source | Prefer structured APIs over HTML. |
| Official delimited | Implemented | Official CSV/TSV/pipe files | Configured person/address fields | Depends on source | Useful for bulk public-record files. |
| Official XML | Implemented | Official XML feeds/APIs | Configured person/address fields | Depends on source | Useful for older government systems. |

## Approved Property Sources Currently Configured

These are configured under `configs/property-sources/` and tracked in `docs/property-source-candidates.md`.

| Source ID | Status | Adapter | Preserved information | Coverage / population | Value | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `wi_statewide_parcels_2025` | Approved for local ingestion | ArcGIS | Parcel owner, situs/property address, mailing/address attributes where exposed | Wisconsin statewide parcels | Very high outside Bay Area | Strong source for ownership and location history, with protected-address obligations. |
| `cook_county_il_parcel_addresses` | Approved for local ingestion | Socrata | Owner/address fields from assessor parcel-address data | Cook County, Illinois | High | Dense county population; public display terms still operator responsibility. |
| `dekalb_county_ga_tax_parcels` | Approved for local ingestion | ArcGIS | Tax parcel owner and situs/mailing fields | DeKalb County, Georgia | High | County property context. |
| `racine_county_wi_tax_parcels` | Approved for local ingestion | ArcGIS | Tax parcel owner and mailing fields | Racine County, Wisconsin | Medium | Current field map uses owner mailing fields where site city/state are not separately exposed. |
| `cedar_rapids_ia_parcels` | Approved for local ingestion | ArcGIS | Parcel owner and mailing fields | Cedar Rapids, Iowa | Medium | City-level coverage. |

## Bay Area Property Source Status

Tracked in `docs/bay-area-property-sources.md` and `configs/property-sources/bay-area/`.

| County / provider | Status | Current practical use | Why it matters |
| --- | --- | --- | --- |
| Alameda County | Reference only | Source discovery, records request path | Important Bay Area coverage; no approved direct import yet. |
| Contra Costa County | Reference only | Source discovery | Owner names are not published online in current notes. |
| Marin County | Reference only | Parcel/map lookup reference | No approved bulk owner-name endpoint identified. |
| Napa County | Reference only | Parcel/GIS reference | No approved bulk owner-name endpoint identified. |
| San Francisco County | Reference only | Assessor-roll structure and parcel context | DataSF assessor roll does not expose owner names in current notes. |
| San Mateo County | Reference only | Parcel/GIS/recorder reference | High-priority area, but no approved bulk owner-name endpoint identified. |
| Santa Clara County | Reference only | Source discovery | Owner names are not displayed online in current notes. |
| Solano County | Reference only | Source discovery | Current notes flag license restrictions on sensitive parcel attributes. |
| Sonoma County | Reference only | Parcel context | Free download excludes owner name in current notes. |
| ParcelQuest California | Licensed-provider candidate | Contract path for all Bay Area counties | Most practical path for owner/address coverage if license permits public display. |

## Existing Aggregate Sources

Aggregate sources are useful for market/context pages and future analytics, but not for individual profile claims.

| Source family | Status | Preserved information | Coverage currently configured | Individual profile use |
| --- | --- | --- | --- | --- |
| Census ACS mobility, tenure, commuting, migration flows | Implemented and configured | County-level movement, tenure, commuting estimates | Bay Area, NYC, Greater Seattle configs | Do not join to profiles. |
| IRS SOI migration | Implemented and configured | County-to-county tax-return migration counts and aggregate AGI | Bay Area, NYC, Greater Seattle configs | Do not infer individual movement or income. |
| Census PEP components | Implemented and configured | County population-change components | Bay Area, NYC, Greater Seattle configs | Aggregate only. |
| Census LEHD LODES | Implemented and configured | Residence-work commute flows | Bay Area, NYC, Greater Seattle configs | Aggregate only. |
| Census ACS housing stock/value/rent/cost/crowding/vacancy/structure/household composition | Implemented and configured | County housing-stock metrics | Bay Area, NYC, Greater Seattle subset configs | Aggregate only. |
| HUD housing assistance and rent sources | Implemented and configured | Voucher, public housing, LIHTC, QCT, DDA, SAFMR, FMR metrics | Bay Area configs | Aggregate/property inventory context only. |
| HUD/Census BPS and local housing permits | Implemented and configured | Aggregate permit activity | Bay Area, NYC, Greater Seattle/local configs | Aggregate only unless a separate approved person-bearing permit dataset is configured. |
| Census ACS economic/social sources and BLS/CBP | Implemented and configured | County income, employment, education, language, race/origin, insurance, poverty, business totals | Bay Area configs | Aggregate only; never infer personal attributes. |

## Potential Source Tracker

This is the shared progress list for future source work. Every coding agent should update this list when a source is researched, approved, implemented, tested, blocked, or removed from scope.

Implementation markers:

- `[ ]` not started.
- `[~]` partial or in progress.
- `[x]` implemented or complete.
- `N/A` intentionally not needed for that source.

Status values:

- `candidate`: useful source, not approved or implemented yet.
- `researching`: source discovery or terms review is underway.
- `in-progress`: implementation exists in the workspace but is not ready for public display.
- `ready-local`: approved for local ingestion, with adapter/loader/config/tests in place.
- `blocked/legal-review`: do not implement or display until legal/product review clears it.
- `deprioritized`: keep documented, but do not spend implementation time right now.

### 1. `licensed-california-property-feed`

- Priority: P0
- Status: `candidate`
- Value: Very high
- Preserved information: Owner names, situs/property address, mailing address, APN, transfer/tax context depending on provider schema.
- Coverage: California statewide if contract allows; this is the most likely path for all nine Bay Area counties.
- Progress:
  - [ ] Approval/terms: contract must allow ad-supported public display, caching, opt-out suppression, and republication.
  - [ ] Adapter: planned `lib/sources/licensed-property-feed.ts` or provider-specific adapter.
  - [ ] Loader/CLI: planned `scripts/ingest-licensed-property-feed.ts`.
  - [~] Config: candidate reference exists at `configs/property-sources/bay-area/parcelquest-california-property.licensed-provider.json`.
  - [ ] Tests: planned `tests/licensed-property-feed.test.ts`.
  - [x] Docs: tracked here and in `docs/bay-area-property-sources.md`.
  - [ ] Display policy: address roles, protected-address suppression, and provenance labels still needed.
- Next step: evaluate provider terms/pricing and obtain a sample schema before writing code.
- Notes: Do not scrape county pages as a substitute for a license.

### 2. `official-open-parcel-sources`

- Priority: P0
- Status: `ready-local` for existing configured sources; `candidate` for new jurisdictions.
- Value: Very high
- Preserved information: Owner name, property/situs address, mailing address, parcel ID, property characteristics, update dates.
- Coverage: Statewide where available or county-by-county.
- Progress:
  - [~] Approval/terms: source-specific review is required for each jurisdiction.
  - [x] Adapter: generic `lib/sources/arcgis.ts` and `lib/sources/socrata.ts`.
  - [x] Loader/CLI: `scripts/ingest-arcgis.ts` and `scripts/ingest-socrata.ts`.
  - [x] Config: examples include `configs/property-sources/wi-statewide-parcels-2025.arcgis.json` and `configs/property-sources/cook-county-il-parcel-addresses.socrata.json`.
  - [x] Tests: `tests/arcgis.test.ts`, `tests/socrata.test.ts`, and property config validation.
  - [x] Docs: `docs/property-source-candidates.md`.
  - [~] Display policy: protected-address review remains operator responsibility per source.
- Next step: add more approved state/county configs with owner and situs fields, then run `npm run sources:validate-property`.
- Notes: Each new config must include source URL, terms URL, mapped fields, and review date.

### 3. `county-recorder-deed-index`

- Priority: P1
- Status: `candidate`
- Value: High
- Preserved information: Grantor/grantee names, document dates, document types, APN/legal description, transaction history, sometimes mailing or property addresses.
- Coverage: County-by-county; especially valuable for ownership movement history.
- Progress:
  - [ ] Approval/terms: needs records-request/export terms or official API terms.
  - [ ] Adapter: planned `lib/sources/recorder-deed-index.ts`.
  - [ ] Loader/CLI: planned `scripts/ingest-recorder-deed-index.ts`.
  - [ ] Config: planned `configs/recorder-sources/<jurisdiction>.json`.
  - [ ] Tests: planned `tests/recorder-deed-index.test.ts`.
  - [ ] Docs: add source-specific docs when first pilot is chosen.
  - [ ] Display policy: deed roles and stale records need clear labels.
- Next step: identify one official export/API or records-request file for a Bay Area county and document its schema.
- Notes: Avoid criminal/court-style records in this adapter.

### 4. `professional-licensing-boards`

- Priority: P1
- Status: `candidate`
- Value: High for professional subsets
- Preserved information: Full name, license number/status, business/practice address, profession, issue/expiration dates, and phone in some boards.
- Coverage: Statewide by profession.
- Progress:
  - [ ] Approval/terms: terms and display restrictions vary by board.
  - [ ] Adapter: planned `lib/sources/professional-license.ts` or board-specific adapters.
  - [ ] Loader/CLI: planned `scripts/ingest-professional-license.ts`.
  - [ ] Config: planned `configs/professional-license-sources/<board>.json`.
  - [ ] Tests: planned `tests/professional-license.test.ts`.
  - [ ] Docs: add board registry when first source is selected.
  - [ ] Display policy: distinguish business/practice address from residence.
- Next step: prioritize California professional rosters with official bulk/API access and clear reuse terms.
- Notes: Do not display disciplinary context without separate policy review.

### 5. `business-entity-registrations`

- Priority: P1
- Status: `candidate`
- Value: Medium/high
- Preserved information: Officers, registered agents, business/mailing addresses, company names, filing dates.
- Coverage: Statewide business owners/officers.
- Progress:
  - [ ] Approval/terms: Secretary of State terms vary by state.
  - [ ] Adapter: planned `lib/sources/business-entity.ts`.
  - [ ] Loader/CLI: planned `scripts/ingest-business-entity.ts`.
  - [ ] Config: planned `configs/business-entity-sources/<state>.json`.
  - [ ] Tests: planned `tests/business-entity.test.ts`.
  - [ ] Docs: add registry when first source is selected.
  - [ ] Display policy: registered-agent and business addresses are not residences.
- Next step: choose one state with official API/bulk access and permissive reuse terms.
- Notes: Good for identity resolution and business affiliations, not residential proof.

### 6. `fec-schedule-a-individual-contributions`

- Priority: P1
- Status: `ready-local` (local auto-refresh enabled; public display still gated)
- Value: High but sensitive
- Preserved information: Contributor name, city/state/ZIP, employer, occupation, contribution dates, committee context, and possible street fields where exposed.
- Coverage: U.S. federal political donors.
- Progress:
  - [ ] Approval/terms: public data, but display policy and legal/product review are still required before broad public display.
  - [x] Adapter: `lib/sources/fec-schedule-a.ts` exists in the workspace.
  - [x] Loader/CLI: `scripts/ingest-fec-schedule-a.ts` exists in the workspace.
  - [ ] Config: N/A for current API-style loader unless source-specific config is later added.
  - [x] Tests: `tests/fec-schedule-a.test.ts` exists in the workspace.
  - [x] Docs: tracked here.
  - [ ] Display policy: do not infer politics; decide whether this is opt-in, hidden, or source-note-only.
- Next step: complete the display-policy review (opt-in / hidden / source-note-only) before any PUBLIC display; local auto-refresh is enabled for development.
- Notes: Political contribution context can be sensitive even when public. Enabled in the local name-search auto-refresh (`lib/name-source-refresh.ts`) on 2026-06-19 for development; it MUST NOT appear on the public, ad-supported site until the display-policy review is complete.

### 7. `local-person-bearing-permits`

- Priority: P2
- Status: `candidate`
- Value: Medium
- Preserved information: Applicant/owner/contractor names, permit addresses, dates, permit type.
- Coverage: City/county datasets, often Socrata or ArcGIS.
- Progress:
  - [ ] Approval/terms: per dataset.
  - [x] Adapter: existing generic `lib/sources/socrata.ts`, `lib/sources/arcgis.ts`, `lib/sources/official-json.ts`, `lib/sources/official-delimited.ts`, and `lib/sources/official-xml.ts` may be reused.
  - [x] Loader/CLI: existing generic loaders may be reused.
  - [ ] Config: needs approved person-bearing permit configs; aggregate permit configs already exist but do not create profiles.
  - [x] Tests: generic adapter tests exist; add dataset-specific tests when field mapping is complex.
  - [ ] Docs: add registry when first person-bearing permit source is selected.
  - [ ] Display policy: label as permit/applicant context, not residence.
- Next step: find one approved permit dataset with person fields and clear reuse terms, then add config.
- Notes: Current housing-permit sources are aggregate and should not be confused with person-bearing permits.

### 8. `court-civil-probate-lien-indexes`

- Priority: P3
- Status: `blocked/legal-review`
- Value: Medium/high but risky
- Preserved information: Names, case/document dates, roles, addresses in some systems.
- Coverage: County/state court systems.
- Progress:
  - [ ] Approval/terms: not cleared.
  - [ ] Adapter: blocked.
  - [ ] Loader/CLI: blocked.
  - [ ] Config: blocked.
  - [ ] Tests: blocked.
  - [x] Docs: tracked here.
  - [ ] Display policy: required before any implementation.
- Next step: legal/product review only.
- Notes: Avoid criminal records in MVP. Civil/court data can be stale, misleading, and high harm.

### 9. `voter-registration-files`

- Priority: P3
- Status: `blocked/legal-review`
- Value: High raw data value, low current product fit
- Preserved information: Name, registration address, party/history fields depending on state.
- Coverage: State-by-state registered voters.
- Progress:
  - [ ] Approval/terms: many states restrict commercial use, republication, or non-election use.
  - [ ] Adapter: blocked.
  - [ ] Loader/CLI: blocked.
  - [ ] Config: blocked.
  - [ ] Tests: blocked.
  - [x] Docs: tracked here.
  - [ ] Display policy: required before any implementation.
- Next step: do not implement unless counsel approves a specific state and use case.
- Notes: Political data is sensitive.

### 10. `consumer-marketing-address-feeds`

- Priority: P4
- Status: `deprioritized`
- Value: Very high data value, poor public-source fit
- Preserved information: Current/past address, phones, household links.
- Coverage: Broad national coverage.
- Progress:
  - [ ] Approval/terms: typically licensed and restricted; not a public source.
  - [ ] Adapter: not planned for MVP.
  - [ ] Loader/CLI: not planned for MVP.
  - [ ] Config: not planned for MVP.
  - [ ] Tests: not planned for MVP.
  - [x] Docs: tracked here.
  - [ ] Display policy: would require a major business/legal posture change.
- Next step: keep out of MVP.
- Notes: Includes USPS/NCOA-like, telecom subscriber, credit-header-like, and consumer-marketing feeds.

### 11. `obituary-probate-death-index`

- Priority: P4
- Status: `deprioritized`
- Value: Low/medium
- Preserved information: Deceased names, relatives, dates, cities.
- Coverage: Patchy public coverage.
- Progress:
  - [ ] Approval/terms: per source.
  - [ ] Adapter: not planned until deceased-profile handling exists.
  - [ ] Loader/CLI: not planned.
  - [ ] Config: not planned.
  - [ ] Tests: not planned.
  - [x] Docs: tracked here.
  - [ ] Display policy: needs deceased/living-person merge policy.
- Next step: revisit after identity model supports deceased profiles.
- Notes: Can create false merges for living people.

### 12. `mt-cadastral-parcels`
- **Priority:** P1
- **Status:** candidate
- **Value:** Statewide Montana parcel ownership with owner name + situs + mailing address — fills a major parcel gap (no MT source currently tracked).
- **Preserved information:** Owner name(s), property situs address, owner mailing address, assessed value, agricultural use, tax district, legal description, parcel geocode. (Note: MT allows owner nondisclosure requests, so some records may be suppressed.)
- **Coverage:** All 56 Montana counties; statewide; refreshed monthly per county.
- **Progress:**
  - [ ] adapter: `lib/sources/mt-cadastral.ts`
  - [ ] loader: `scripts/ingest-mt-cadastral.ts`
  - [ ] config: `configs/mt-cadastral.json`
  - [ ] tests: `lib/sources/__tests__/mt-cadastral.test.ts`
  - [ ] docs: `docs/data-sources.md` (new section)
  - [ ] display-policy: mailing vs situs address role labeling
- **Next step:** Confirm exact reuse terms on MSL cadastral page / via MSL (406-444-5354); prototype per-county monthly bulk + ArcGIS REST MapServer (gisservicemt.gov) pull.
- **Notes:** Public/open-data. Monthly cadence good for freshness.

### 13. `hcad-harris-county-tx`
- **Priority:** P1
- **Status:** candidate
- **Value:** ~2M accounts in Houston metro — one of the largest US county appraisal datasets; owner name + mailing + situs addresses free.
- **Preserved information:** Real & Personal Property DB: owner name, owner mailing address, property/situs address, account number, certified/preliminary appraised values; GIS shapefiles keyed by APN (quarterly).
- **Coverage:** Harris County, TX (Houston metro), ~2M+ accounts.
- **Progress:**
  - [ ] adapter: `lib/sources/hcad.ts`
  - [ ] loader: `scripts/ingest-hcad.ts`
  - [ ] config: `configs/hcad.json`
  - [ ] tests: `lib/sources/__tests__/hcad.test.ts`
  - [ ] docs
  - [ ] display-policy: mailing vs situs role labeling
- **Next step:** Build text-file + shapefile importer from hcad.org/pdata/ downloads; map APN to parcel join.
- **Notes:** Free, no registration. Quarterly GIS.

### 14. `fl-fdor-statewide-parcels`
- **Priority:** P1
- **Status:** candidate
- **Value:** All 67 FL counties via FDOR tax roll + FGIO statewide parcel layer — statewide Florida coverage not currently tracked (Cook/DeKalb/Racine/Cedar Rapids/WI are).
- **Preserved information:** Owner name, mailing address, situs address, sales data, valuations, building info, parcel/folio ID.
- **Coverage:** Statewide Florida, all 67 counties.
- **Progress:**
  - [ ] adapter: `lib/sources/fl-fdor.ts`
  - [ ] loader: `scripts/ingest-fl-fdor.ts`
  - [ ] config: `configs/fl-fdor.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy
- **Next step:** Request FDOR assessment roll (Chapter 119 FS) + ingest FGIO/FGDL bulk parcels.
- **Notes:** Public record, open formats.

### 15. `irs-form-990-officers`
- **Priority:** P1
- **Status:** candidate
- **Value:** Every e-filed 990 lists ALL current officers/directors/trustees with full name, title, compensation, and business address — ~1.5M nonprofits, hundreds of millions of officer-year records.
- **Preserved information:** Part VII PersonNm, TitleTxt, ReportableCompFromOrgAmt/OtherCompensationAmt, business address group (street/city/state/ZIP); EIN, org name/address.
- **Coverage:** All US tax-exempt orgs e-filing 990 series; ~2010/2011-present, monthly.
- **Progress:**
  - [ ] adapter: `lib/sources/irs-990.ts`
  - [ ] loader: `scripts/ingest-irs-990.ts` (XML Part VII parser)
  - [ ] config: `configs/irs-990.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: business (not residential) address labeling
- **Next step:** Prototype IRS monthly bulk XML parse; consider ProPublica Nonprofit Explorer API v2 for filing index.
- **Notes:** US Gov public record, no copyright.

### 16. `nih-reporter`
- **Priority:** P1
- **Status:** candidate
- **Value:** Richest biomedical PI dataset — named contact PI + all PIs, org name+address, across NIH/CDC/FDA/AHRQ/VA/EPA; back to 1970.
- **Preserved information:** PI and contact PI full name (+ profile ID), project leader, applicant org name+address+city/state, award/project numbers, costs, title/abstract, linked publications/patents.
- **Coverage:** All NIH-funded + participating HHS/other agency projects FY1985-present (ExPORTER to FY1970).
- **Progress:**
  - [ ] adapter: `lib/sources/nih-reporter.ts`
  - [ ] loader: `scripts/ingest-nih-reporter.ts`
  - [ ] config: `configs/nih-reporter.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: institution/work address labeling
- **Next step:** Implement RePORTER v2 POST queries (PI/institution/state filters); bulk-load ExPORTER yearly CSV.
- **Notes:** US Gov public domain; API no key required.

### 17. `tn-comptroller-parcels`
- **Priority:** P1
- **Status:** candidate
- **Value:** Statewide Tennessee parcel ownership via TNMap — fills TN parcel gap; monthly refresh.
- **Preserved information:** Parcel boundaries with ownership attribution; owner identity tied to parcel+address statewide.
- **Coverage:** Tennessee statewide by county; updated ~first business day monthly.
- **Progress:**
  - [ ] adapter: `lib/sources/tn-comptroller.ts`
  - [ ] loader: `scripts/ingest-tn-comptroller.ts`
  - [ ] config: `configs/tn-comptroller.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy
- **Next step:** County-by-county bulk from TN Comptroller + TNMap/Geodata open data portal.
- **Notes:** State open data, free, no registration.

### 18. `nsf-award-search`
- **Priority:** P1
- **Status:** candidate
- **Value:** Named PIs/co-PIs + institution addresses across all NSF STEM awards (~1960s-present); explicitly public domain, no-key API.
- **Preserved information:** PI/co-PI first+last name, org name+city/state/ZIP, award title/abstract, program/directorate, amounts/dates.
- **Coverage:** All NSF-funded awards nationwide; tens of thousands of awards.
- **Progress:**
  - [ ] adapter: `lib/sources/nsf-award.ts`
  - [ ] loader: `scripts/ingest-nsf-award.ts`
  - [ ] config: `configs/nsf-award.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: institution/work address
- **Next step:** Implement Research.gov REST API (resources.research.gov) queries; ingest Jan-2025 JSON bulk archive.
- **Notes:** Explicit public-domain statement; ideal lawful grant source.

### 19. `nyc-acris-deeds`
- **Priority:** P1
- **Status:** candidate
- **Value:** NYC recorded deed/mortgage parties (grantor/grantee) tie named individuals to NYC property — complements existing county recorder deed index family with a major metro.
- **Preserved information:** Real property document parties (grantor/grantee names), doc type, recording date, property address/lot, document images.
- **Coverage:** Manhattan, Bronx, Brooklyn, Queens (Staten Island/Richmond separate).
- **Progress:**
  - [ ] adapter: `lib/sources/nyc-acris.ts`
  - [ ] loader: `scripts/ingest-nyc-acris.ts`
  - [ ] config: `configs/nyc-acris.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: party-role (grantor/grantee) labeling
- **Next step:** Ingest NYC Open Data ACRIS Real Property Master (bnx9-e6tj) + Legals/Parties datasets.
- **Notes:** NYC open data, free CSV/API.

### 20. `maricopa-county-az-parcels`
- **Priority:** P1
- **Status:** candidate
- **Value:** Largest US county parcel dataset by population (Phoenix metro); owner name + situs via Assessor data.
- **Preserved information:** Parcel shapefile countywide keyed by APN; assessor identification/classification/valuation attributes; owner name + situs.
- **Coverage:** Maricopa County, AZ; updated daily/weekly.
- **Progress:**
  - [ ] adapter: `lib/sources/maricopa.ts`
  - [ ] loader: `scripts/ingest-maricopa.ts`
  - [ ] config: `configs/maricopa.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy
- **Next step:** Pull free shapefiles from mcassessor.maricopa.gov + data-maricopa.opendata.arcgis.com.
- **Notes:** County GIS open data, free.

### 21. `uspto-trademark-owners`
- **Priority:** P1
- **Status:** candidate
- **Value:** Trademark owner/applicant full name + applicant address (street/city/state) for individual applicants — direct named-person-to-address link.
- **Preserved information:** Owner/applicant name, entity type, applicant address, correspondence address, attorney of record, mark, filing/registration dates, status.
- **Coverage:** All US federal trademark applications/registrations; decades of records; daily front files + backfile.
- **Progress:**
  - [ ] adapter: `lib/sources/uspto-trademark.ts`
  - [ ] loader: `scripts/ingest-uspto-trademark.ts`
  - [ ] config: `configs/uspto-trademark.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: distinguish individual vs entity applicant
- **Next step:** Use USPTO Open Data Portal (data.uspto.gov) free bulk; optional TSDR API key for prosecution history.
- **Notes:** US Gov public data, no copyright.

### 22. `uspto-patent-inventors`
- **Priority:** P2
- **Status:** candidate
- **Value:** All US patent inventors (1976-present) with name + city/state + assignee; PatentsView disambiguation; no street address so moderate precision.
- **Preserved information:** Per inventor full name, city/state/country, assignee; PatentsView: disambiguated inventor_id, cleaned names, geocoded location.
- **Coverage:** All US patent grants (1976+) and applications (2001+).
- **Progress:**
  - [ ] adapter: `lib/sources/uspto-patent.ts`
  - [ ] loader: `scripts/ingest-uspto-patent.ts`
  - [ ] config: `configs/uspto-patent.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: city/state-only precision note
- **Next step:** Ingest USPTO ADV0/APP0 bibliographic bulk + PatentsView inventor.tsv/location.tsv.
- **Notes:** City/state only, no street — identity context strong but address imprecise.

### 23. `ar-gis-office-parcels`
- **Priority:** P2
- **Status:** candidate
- **Value:** Statewide Arkansas landowner/parcel attribution — fills AR parcel gap.
- **Preserved information:** Statewide landowner/parcel attribution searchable by owner and parcel.
- **Coverage:** Statewide Arkansas.
- **Progress:**
  - [ ] adapter: `lib/sources/ar-gis.ts`
  - [ ] loader: `scripts/ingest-ar-gis.ts`
  - [ ] config: `configs/ar-gis.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy
- **Next step:** Pull from gis.arkansas.gov/download + AGISO statewide parcel search app.
- **Notes:** Free statewide coverage.

### 24. `va-nationwide-gravesite-locator`
- **Priority:** P2
- **Status:** candidate
- **Value:** 3M+ veteran/dependent records with name + DOB/DOD + real burial cemetery address; distinct from obituary-probate-death-index (vital-record/index vs memorial).
- **Preserved information:** Deceased veteran/dependent full name, DOB, DOD, burial/interment date, burial location (section/plot), cemetery name+street address.
- **Coverage:** VA national + state veterans cemeteries + some private; ~120+ cemeteries; since Civil War.
- **Progress:**
  - [ ] adapter: `lib/sources/va-gravesite.ts`
  - [ ] loader: `scripts/ingest-va-gravesite.ts`
  - [ ] config: `configs/va-gravesite.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: deceased-profile merge + burial-location (not residence) labeling
- **Next step:** Ingest data.va.gov dataset 3u66-fxug (CSV/JSON/RDF); requires deceased-profile merge handling.
- **Notes:** US federal public data, no copyright (17 USC 105). Residential relevance 4 (burial addr, not prior home).

### 25. `nyc-citywide-payroll`
- **Priority:** P2
- **Status:** candidate
- **Value:** ~300k NYC municipal employees per fiscal year with full names — large named-individual public-payroll set; Socrata adapter likely already exists.
- **Preserved information:** First/last/middle name, agency, agency start date, work location borough, title, base/gross pay, fiscal year.
- **Coverage:** All active NYC municipal employees; ~300k+/fy; multiple historical years.
- **Progress:**
  - [ ] adapter: `lib/sources/socrata.ts` (reuse existing)
  - [ ] loader: `scripts/ingest-nyc-payroll.ts`
  - [ ] config: `configs/nyc-payroll.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: workplace-not-residence labeling
- **Next step:** Map dataset k397-673e to existing Socrata adapter; confirm SODA API access.
- **Notes:** Work-borough context, NOT residence.

### 26. `chicago-current-employee-salaries`
- **Priority:** P2
- **Status:** candidate
- **Value:** ~30k Chicago employees with full names + departments; Socrata adapter reuse.
- **Preserved information:** Full name, department, position/title, employment status, annual salary or hourly rate.
- **Coverage:** All active City of Chicago employees (~30k+).
- **Progress:**
  - [ ] adapter: `lib/sources/socrata.ts` (reuse)
  - [ ] loader: `scripts/ingest-chicago-payroll.ts`
  - [ ] config: `configs/chicago-payroll.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: workplace-not-residence
- **Next step:** Map dataset xzkq-xp2w to Socrata adapter.
- **Notes:** Department = workplace context.

### 27. `florida-state-employee-salaries`
- **Priority:** P2
- **Status:** candidate
- **Value:** FL state personnel + courts employees with full names + titles; official CSV export.
- **Preserved information:** Last/first/middle name, agency, budget entity, position, employee type, class title, state hire date, salary.
- **Coverage:** FL State Personnel System agencies, Lottery, JAC, State Courts; sibling university portal exists.
- **Progress:**
  - [ ] adapter: `lib/sources/fl-salaries.ts`
  - [ ] loader: `scripts/ingest-fl-salaries.ts`
  - [ ] config: `configs/fl-salaries.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: workplace-not-residence
- **Next step:** Pull ?format=csv from salaries.myflorida.com; confirm refresh cadence.
- **Notes:** FL public-record transparency data.

### 28. `ohio-sos-monthly-business-reports`
- **Priority:** P2
- **Status:** candidate
- **Value:** Concrete OH instance of business-entity-registrations family with free monthly bulk path — officer/manager/registered-agent name+address.
- **Preserved information:** Officer/manager/registered-agent name+address, entity name/type/status, formation date, filing type.
- **Coverage:** All new+updated OH business entity filings; monthly.
- **Progress:**
  - [ ] adapter: `lib/sources/ohio-sos-business.ts`
  - [ ] loader: `scripts/ingest-ohio-sos-business.ts`
  - [ ] config: `configs/ohio-sos-business.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: business/contact address role labeling
- **Next step:** Pull free monthly CSV from ohiosos.gov/business/business-reports.
- **Notes:** Registered-agent/officer addresses are business/contact, NOT residences.

### 29. `doj-fara-registrants`
- **Priority:** P2
- **Status:** candidate
- **Value:** Named foreign-agent registrants + officers with business addresses + linked foreign principals; high identity specificity.
- **Preserved information:** Registrant/officer name, business address, registration number, foreign principals (name/address/country).
- **Coverage:** All FARA registrants 1942-present; thousands.
- **Progress:**
  - [ ] adapter: `lib/sources/doj-fara.ts`
  - [ ] loader: `scripts/ingest-doj-fara.ts`
  - [ ] config: `configs/doj-fara.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: business address labeling
- **Next step:** Parse DOJ FARA eFile XML or OpenSanctions CC0 bulk (FARA_All_Registrants.xml).
- **Notes:** Small population but high specificity.

### 30. `senate-lda-lobbying`
- **Priority:** P2
- **Status:** candidate
- **Value:** Named federal lobbyists (tens of thousands since 1999) tied to firms/clients/addresses; distinct from FEC Schedule A.
- **Preserved information:** Registered lobbyist full names, client, registrant/firm, covered government positions, firm business address.
- **Coverage:** All federally registered lobbyists/clients since 1999; quarterly.
- **Progress:**
  - [ ] adapter: `lib/sources/senate-lda.ts`
  - [ ] loader: `scripts/ingest-senate-lda.ts`
  - [ ] config: `configs/senate-lda.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: firm business address
- **Next step:** Use Senate SOPR API (lda.senate.gov, HLOGA Sec.208); cross-ref House Clerk.
- **Notes:** Distinct from FEC Schedule A.

### 31. `sec-edgar-insiders`
- **Priority:** P2
- **Status:** candidate
- **Value:** SEC insiders (officers/directors/10% owners) named with addresses (often residential) on Forms 3/4/5 + executive rosters in DEF 14A/10-K.
- **Preserved information:** Reporting person full name, relationship (officer/director/10% owner), address; proxy/10-K named executives.
- **Coverage:** All SEC-reporting company insiders; millions of 3/4/5 events since 1993/2001.
- **Progress:**
  - [ ] adapter: `lib/sources/sec-edgar.ts`
  - [ ] loader: `scripts/ingest-sec-edgar.ts`
  - [ ] config: `configs/sec-edgar.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: residential-vs-business address role; honor EDGAR rate-limit/user-agent policy
- **Next step:** Ingest EDGAR master index files (per quarter/CIK); parse Forms 3/4/5 + DEF 14A cover pages.
- **Notes:** Address often residential — high value but sensitive; respect SEC fair-access rate limits.

### 32. `ssa-death-master-file`
- **Priority:** P1 (high value, gated)
- **Status:** researching
- **Value:** 83M+ deceased records with SSN + DOB + DOD + last residence — strongest death/identity dataset; gated by NTIS certification.
- **Preserved information:** Deceased name, SSN, DOB, DOD, state of SSN issuance, last known residence/lump-sum location (fuller LADMF).
- **Coverage:** Nationwide; deaths from ~1962; 3-year recency lag on state-level data.
- **Progress:**
  - [ ] adapter: `lib/sources/ssa-dmf.ts` (blocked on certification)
  - [ ] loader: `scripts/ingest-ssa-dmf.ts`
  - [ ] config: `configs/ssa-dmf.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: deceased-profile merge handling NOT yet built; redistribution restricted by license
- **Next step:** Legal review of NTIS LADMF certification + permitted-use gating (fraud-prevention/identity-verification/research); confirm redistribution terms before adapter.
- **Notes:** CONDITIONAL — licensed; requires NTIS certification + deceased-merge feature before integration. Redistribution restricted.

### 33. `la-county-assessor-parcels`
- **Priority:** P2
- **Status:** researching
- **Value:** LA County (~2.7M parcels) free open Assessor Parcel Data File — distinct from/complementary to the already-tracked licensed CA property feed.
- **Preserved information:** AIN, owner/situs attributes, roll-year assessment data, use codes, exemptions.
- **Coverage:** LA County, CA (~2.7M parcels); annual roll 2006-present.
- **Progress:**
  - [ ] adapter: `lib/sources/la-county-assessor.ts`
  - [ ] loader: `scripts/ingest-la-county-assessor.ts`
  - [ ] config: `configs/la-county-assessor.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy
- **Next step:** Confirm this free county open dataset is distinct from (not duplicative of) the licensed CA property feed; assess field overlap before building.
- **Notes:** CONDITIONAL — confirm non-duplication with licensed CA feed; CA owner nondisclosure may suppress some records.

### 34. `reclaim-the-records-death-indexes`
- **Priority:** P2
- **Status:** researching
- **Value:** FOIA-released state death indexes (NY/NJ/MO) with deceased name + DOD + DOB + place of death — distinct from obituary-probate-death-index (govt vital records).
- **Preserved information:** Deceased name, DOD, DOB (varies), place of death (city/county), certificate number, sometimes parents/relatives.
- **Coverage:** NY 1880-2017 (~10.5M), NJ 1904-2017, MO 1954-2024 (~3.9M); partial KY/CT/MD/MS.
- **Progress:**
  - [ ] adapter: `lib/sources/reclaim-death.ts`
  - [ ] loader: `scripts/ingest-reclaim-death.ts`
  - [ ] config: `configs/reclaim-death.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: deceased-profile merge handling NOT yet built
- **Next step:** Build deceased-profile merge feature; bulk-load Internet Archive CSVs (archive.org/details/reclaim-the-records-*).
- **Notes:** CONDITIONAL — public domain/CC0; merge feature prerequisite. Distinct from obituary-probate-death-index.

### 35. `ca-calaccess-campaign-finance-raw-data`
- **Priority:** P2
- **Status:** researching
- **Value:** CA state/local campaign contributors + lobbyists with name + address + employer — distinct from federal FEC Schedule A; ~80 structured raw files.
- **Preserved information:** Contributor name, city/state/ZIP, street address, employer, occupation, amount/date, committee/candidate; lobbying employer/lobbyist names.
- **Coverage:** All CA state/local campaign committees/lobbyists; daily/periodic snapshots.
- **Progress:**
  - [ ] adapter: `lib/sources/ca-calaccess.ts`
  - [ ] loader: `scripts/ingest-ca-calaccess.ts`
  - [ ] config: `configs/ca-calaccess.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: political-contribution sensitivity review; source-observed (not residence) labeling
- **Next step:** Legal/display-policy review (same posture as in-progress FEC Schedule A); ingest SOS raw-data bulk files.
- **Notes:** CONDITIONAL — contributor addresses user-filed; political-contribution context sensitive.

### 36. `nysboe-campaign-finance-bulk-data`
- **Priority:** P2
- **Status:** researching
- **Value:** NYS itemized contributors since July 1999 with name + address + employer — distinct from federal FEC.
- **Preserved information:** Itemized contributor name, address (street/city/state/ZIP), employer, occupation, amount/date, committee/filer.
- **Coverage:** All NYS itemized disclosure reports, July 1999-present.
- **Progress:**
  - [ ] adapter: `lib/sources/nysboe.ts`
  - [ ] loader: `scripts/ingest-nysboe.ts`
  - [ ] config: `configs/nysboe.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: source-observed (often employer/work addr); political-sensitivity review
- **Next step:** Legal/display review (FEC Schedule A posture); pull official bulk pipe/CSV.
- **Notes:** CONDITIONAL — addresses often employer/work, not residence.

### 37. `ohio-sos-campaign-finance-portal`
- **Priority:** P2
- **Status:** researching
- **Value:** OH state campaign contributors via existing Socrata adapter — fast integration path.
- **Preserved information:** Contributor name, city/state/ZIP, employer/occupation, amount/date, committee/candidate/filer.
- **Coverage:** OH statewide + state-legislative campaign finance.
- **Progress:**
  - [ ] adapter: `lib/sources/socrata.ts` (reuse)
  - [ ] loader: `scripts/ingest-ohio-cf.ts`
  - [ ] config: `configs/ohio-cf.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: source-observed labeling; political-sensitivity review
- **Next step:** Map data.ohiosos.gov/portal/campaign-finance to Socrata adapter; legal review.
- **Notes:** CONDITIONAL — self-reported donor city/state/ZIP; political-sensitivity review.

### 38. `familysearch-historical-records`
- **Priority:** P2
- **Status:** researching
- **Value:** Aggregated deceased vital records incl. SSDI (last-residence ZIP), state death indexes, cemetery indexes; broad coverage.
- **Preserved information:** SSDI name, SSN, issuance state, DOB/DOD, last residence ZIP, last benefit location; plus state death indexes, Find A Grave/BillionGraves indexes.
- **Coverage:** Nationwide US + intl; SSDI current to 2014; many state/cemetery indexes.
- **Progress:**
  - [ ] adapter: `lib/sources/familysearch.ts` (blocked on API approval)
  - [ ] loader: `scripts/ingest-familysearch.ts`
  - [ ] config: `configs/familysearch.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: deceased-profile merge handling; sub-collection redistribution limits
- **Next step:** Register FamilySearch API app + accept licensing terms; legal review of commercial redistribution + third-party sub-collection limits; build deceased-merge.
- **Notes:** CONDITIONAL — licensed; API approval use-case-dependent (may be declined); sub-collection redistribution limits need legal review.

### 39. `faa-airmen-registry`
- **Priority:** P3
- **Status:** researching
- **Value:** Named FAA-certificated airmen with mailing address (unless opted out) — but growing opt-out share degrades address coverage.
- **Preserved information:** Airman full name, certificate number, certificate type(s)/ratings, mailing address (street/city/state/ZIP unless opted out).
- **Coverage:** All FAA-certificated airmen; hundreds of thousands; periodic updates.
- **Progress:**
  - [ ] adapter: `lib/sources/faa-airmen.ts`
  - [ ] loader: `scripts/ingest-faa-airmen.ts`
  - [ ] config: `configs/faa-airmen.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: honor opt-out; suppress withheld addresses; label name-only records
- **Next step:** Ingest official FAA Releasable Airmen Download; implement opt-out/withheld-address handling.
- **Notes:** CONDITIONAL — Privacy Act SORN; airmen may opt out of address (name stays public). Growing withheld share.

### 40. `fl-sunbiz-business-entity-search`
- **Priority:** P3
- **Status:** researching
- **Value:** FL (large entity registry) officers/directors/registered agents — but HTML-only path; records-request preferred.
- **Preserved information:** Officers, directors, managers, registered-agent name+address, entity name/type/status, annual-report history, principal address.
- **Coverage:** All FL corporations, LLCs, LPs.
- **Progress:**
  - [ ] adapter: `lib/sources/fl-sunbiz.ts`
  - [ ] loader: `scripts/ingest-fl-sunbiz.ts`
  - [ ] config: `configs/fl-sunbiz.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: business/contact address role
- **Next step:** Pursue FL Dept. of State public-records bulk extract instead of HTML scraping (AGENTS.md requires explicit permission for HTML).
- **Notes:** CONDITIONAL — HTML path needs explicit permission; registered-agent/officer addresses are business/contact, NOT residences.

### 41. `ga-corporations-division-ecorp`
- **Priority:** P3
- **Status:** researching
- **Value:** GA officers + registered agents — free per-record search public record; bulk FTP is paid subscription.
- **Preserved information:** Officer + registered-agent name+address, entity name/type/status, annual-registration filings, registered office address.
- **Coverage:** All GA corporations, LLCs, LPs.
- **Progress:**
  - [ ] adapter: `lib/sources/ga-ecorp.ts`
  - [ ] loader: `scripts/ingest-ga-ecorp.ts`
  - [ ] config: `configs/ga-ecorp.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: business/contact address role
- **Next step:** Legal review of bulk FTP subscriber-agreement terms before commercial use; otherwise limited free-search path.
- **Notes:** CONDITIONAL — bulk product requires license/subscriber-terms review; addresses are business/contact.

### 42. `wa-sos-ccfs-corporations-search`
- **Priority:** P3
- **Status:** researching
- **Value:** WA entities + charities with registered agent + governor/officer name+address; rated most accessible US registry by OpenCorporates.
- **Preserved information:** Registered agent + governor/officer name+address, entity name/type/status, UBI, formation date, registered office.
- **Coverage:** All WA registered business entities + charities.
- **Progress:**
  - [ ] adapter: `lib/sources/wa-ccfs.ts`
  - [ ] loader: `scripts/ingest-wa-ccfs.ts`
  - [ ] config: `configs/wa-ccfs.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: business/contact address role; review WA.gov ToU compilation clause
- **Next step:** Review WA.gov Terms of Use compilation-reuse clause before broad commercial display; use ccfs.sos.wa.gov list/export.
- **Notes:** CONDITIONAL — WA ToU compilation clause needs review; addresses are business/contact.

### 43. `chronicling-america-newspaper-obituaries`
- **Priority:** P3
- **Status:** researching
- **Value:** Official LoC newspaper-archive API with OCR obituary text (name, DOD, relatives, residence) — but pre-1964 focus + needs NLP parsing.
- **Preserved information:** Obituary/death-notice OCR text: deceased name, date/place of death, surviving relatives, city/neighborhood of residence, burial location; page images.
- **Coverage:** Historic US newspapers 1758-1963; ~20M+ pages from 4,000+ titles.
- **Progress:**
  - [ ] adapter: `lib/sources/chronicling-america.ts`
  - [ ] loader: `scripts/ingest-chronicling-america.ts` (+ NLP obituary parser)
  - [ ] config: `configs/chronicling-america.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: deceased-profile merge; OCR-confidence/uncertainty labeling
- **Next step:** Build deceased-profile merge + NLP obituary extraction; query loc.gov JSON API.
- **Notes:** CONDITIONAL — public domain; coverage ends ~1963; merge + NLP not yet built.

### 44. `sam-gov-entity-registrations`
- **Priority:** P3
- **Status:** researching
- **Value:** Federal contractor/grantee entities with named POCs + addresses — entity-centric so individuals appear only as POCs (indirect).
- **Preserved information:** Legal business name, DBA, physical+mailing address, UEI, registration expiration, named POC (phone/email), congressional district; exclusions (debarred, named+address).
- **Coverage:** All entities registered to do business with US federal government; hundreds of thousands; daily/monthly extracts.
- **Progress:**
  - [ ] adapter: `lib/sources/sam-gov.ts`
  - [ ] loader: `scripts/ingest-sam-gov.ts`
  - [ ] config: `configs/sam-gov.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: POC-role labeling (organization-centric)
- **Next step:** Use SAM.gov Data Services public entity/exclusions extracts (Entity/Exclusions Extracts API).
- **Notes:** CONDITIONAL — named individuals appear only as POCs, not as registered subject; identity context indirect.

### 45. `usda-nifa-cris`
- **Priority:** P3
- **Status:** researching
- **Value:** USDA ag/food research PIs (30k+ projects) — but no REST API, HTML/structured-export only.
- **Preserved information:** PI name, co-project leaders, institution/state, project number/title/abstract, keywords, funding, dates, progress/impact narratives.
- **Coverage:** All USDA/NIFA-funded ag/food/nutrition/forestry research; 30k+ projects.
- **Progress:**
  - [ ] adapter: `lib/sources/usda-nifa-cris.ts`
  - [ ] loader: `scripts/ingest-usda-nifa-cris.ts`
  - [ ] config: `configs/usda-nifa-cris.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: institution/work address
- **Next step:** Obtain explicit automated-access permission for HTML per AGENTS.md, or pursue structured NIFA Data Gateway / REEIS export.
- **Notes:** CONDITIONAL — HTML-only; AGENTS.md requires explicit permission before HTML use.

### 46. `doe-pams-award-search`
- **Priority:** P3
- **Status:** researching
- **Value:** DOE Office of Science PIs/co-PIs — but HTML/web-form only, lower coverage (no EERE).
- **Preserved information:** PI + co-PI names, institution/location, award/coop-agreement number, SC program office, amount, abstract, performance period.
- **Coverage:** DOE Office of Science grants/coop agreements 1985-present.
- **Progress:**
  - [ ] adapter: `lib/sources/doe-pams.ts`
  - [ ] loader: `scripts/ingest-doe-pams.ts`
  - [ ] config: `configs/doe-pams.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: institution/work address
- **Next step:** Obtain explicit automated-access permission for HTML per AGENTS.md, or find a bulk export path.
- **Notes:** CONDITIONAL — HTML-only; lowest quality of grant sources; partial coverage.

### 47. `seethroughny-payrolls`
- **Priority:** P3
- **Status:** researching
- **Value:** NY state/local payroll names — but nonprofit republisher; prefer upstream official feeds.
- **Preserved information:** Employee name, position/title, employer (NYS/NYC/authority/local gov), base pay, total pay, year.
- **Coverage:** NYS, NYC, public authorities, NY local gov; state payroll 2008-2023.
- **Progress:**
  - [ ] adapter: deferred — prefer upstream NYC Open Data / NYS OSC
  - [ ] loader: n/a
  - [ ] config: n/a
  - [ ] tests: n/a
  - [ ] docs: cross-reference only
  - [ ] display-policy: workplace-not-residence
- **Next step:** Use as cross-reference; ingest upstream official NY payroll feeds instead. Review seethroughny.net/terms-use if used.
- **Notes:** CONDITIONAL — nonprofit republisher (FOIL-derived); prefer upstream official sources.

### 48. `uc-annual-wage`
- **Priority:** P3
- **Status:** researching
- **Value:** UC system employee pay with names — but search-only, no bulk; HTML permission required.
- **Preserved information:** Employee name, UC campus/location, job title/category, annual pay, year.
- **Coverage:** All UC campuses + UCOP; multiple years.
- **Progress:**
  - [ ] adapter: `lib/sources/uc-annual-wage.ts` (blocked on bulk access)
  - [ ] loader: `scripts/ingest-uc-annual-wage.ts`
  - [ ] config: `configs/uc-annual-wage.json`
  - [ ] tests
  - [ ] docs
  - [ ] display-policy: workplace-not-residence
- **Next step:** Pursue UC bulk feed / records-request export; confirm HTML automated-access permission per AGENTS.md.
- **Notes:** CONDITIONAL — search-only, no bulk; CA State Controller GCC omits names (excluded).

## Immediate Recommended Backlog

Highest-leverage new sources (public record, free bulk/API, no scraping, no license negotiation) discovered 2026-06-19 — full quality ranking in `docs/data-source-quality-ranking.md`:

1. `irs-form-990-officers` — ~1.5M nonprofits; named officers/directors + business address from one XML schema; monthly bulk.
2. `fl-fdor-statewide-parcels` — all 67 FL counties; owner + mailing + situs addresses.
3. `hcad-harris-county-tx` — ~2M Houston-metro accounts; free bulk text + shapefiles.
4. `nih-reporter` + `nsf-award-search` — named federal-grant PIs + institution address; public-domain APIs.
5. `nyc-acris-deeds` — NYC grantor/grantee deed parties tied to property.

Existing priorities:

6. Decide display/legal policy for `fec-schedule-a-individual-contributions`.
7. Evaluate `licensed-california-property-feed` terms and sample schema.
8. Add one more `official-open-parcel-sources` config with owner and situs fields.
9. Choose one `professional-licensing-boards` pilot source.
10. Choose one `county-recorder-deed-index` pilot export or API.

## Display Policy For Address History

- `property address`, `situs address`, `mailing address`, `practice address`, and `business address` are different evidence types.
- The profile page should label records as source-observed locations, not confirmed residences.
- Movement history should preserve source type, source name, date observed or record date, and address role when available.
- Source platforms and catalog systems are provenance, not places lived.
- Suppressed profiles and protected addresses must be filtered at display time even when cached result IDs exist.

## Docs To Keep In Sync

- `docs/source-adapters.md`
- `docs/data-source-quality-ranking.md` — residential-weighted quality ranking of every source (companion to this tracker).
- `docs/property-source-candidates.md`
- `docs/bay-area-property-sources.md`
- `docs/aggregate-mobility-sources.md`
- `docs/aggregate-housing-stock-sources.md`
- `docs/aggregate-housing-permit-sources.md`
- `docs/aggregate-housing-assistance-sources.md`
- `docs/aggregate-economic-sources.md`
- `docs/aggregate-social-sources.md`
- `docs/requirements.md`
