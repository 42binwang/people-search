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

**API-key-required sources are excluded for now.** Adapters that no-op without an operator-provided key — `uspto-trademark` (`USPTO_API_KEY`), `uspto-patent` (`PATENTSVIEW_API_KEY`), `sam-gov` (`SAM_GOV_API_KEY`) — are de-activated: removed from name-search auto-refresh and the `ingest:*` scripts, and marked `excluded` in the tracker. Their adapter/loader/test files are retained on disk for potential re-enablement if keys are obtained and the policy changes.

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
| ORCID public registry | Implemented, automatic name refresh | Public API | Public researcher identifier, profile metadata, and researcher-declared website/social links (e.g. LinkedIn where the researcher listed one) | Researchers with public ORCID records | Low/medium | Respect public visibility flags. Researcher-declared links surface as outbound profile links only; we never scrape the linked sites. |
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
| NIH RePORTer projects | Implemented, automatic name refresh | Public API | Principal investigator names, project title, applicant institution, fiscal year | NIH/HHS-funded researchers | Low/medium | Federal research-grant PI context only; institution is not a residential location. |
| NSF awards | Implemented, automatic name refresh | Public API | Principal investigator names, award title, awardee institution, start year | NSF-funded researchers | Low/medium | Federal research-grant PI context only; institution is not a residential location. Public domain. |
| NYC Citywide Payroll | Implemented, automatic name refresh | Public API (SODA) | Employee name, agency, title, fiscal year | NYC municipal employees | Medium | Public payroll record. Agency is a workplace affiliation, not a residence. |
| Chicago employee salaries | Implemented, automatic name refresh | Public API (SODA) | Employee name, department, job title | City of Chicago employees | Medium | Public payroll record. Department is a workplace affiliation, not a residence. |
| Florida state employee salaries | Implemented, automatic name refresh | Public CSV | Employee name, agency, class title, state hire year | Florida state employees | Medium | Public payroll record. Agency is a workplace affiliation, not a residence. |
| SeeThroughNY payrolls | Implemented, automatic name refresh | Public JSON | Employee name, employer, title, pay year | NYS/NYC/local NY public employees | Medium | Nonprofit republisher (FOIL-derived). Employer is a workplace affiliation, not a residence. Terms-of-use review pending public display. |
| UC annual wage | Implemented, automatic name refresh | Public JSON | Employee name, UC campus, job title, pay year | University of California employees | Medium | Official UCOP disclosure. Campus is a workplace affiliation, not a residence. |
| NYC ACRIS deeds | Implemented, automatic name refresh | Public API (SODA) | Real property document party names (grantor/grantee), party/property address, recording date | NYC property-record parties | Medium | Recorded property-record context; address is the recorded property address, not a current residence. |
| Chronicling America obituaries | Implemented, automatic name refresh | Public API (loc.gov) | Name matched in historic newspaper OCR; newspaper title, date, publication city/state | Historic US newspaper mentions (1758–1963) | Low | Weak OCR match; publication location is context, not a residence. Public domain. |
| SEC EDGAR insiders | Implemented, automatic name refresh | Public API (EDGAR) | Insider name, issuer/company, officer/director/10% role, filing year | SEC-reporting company insiders | Low/medium | Securities-filing context. Issuer affiliation only; residential addresses are deliberately NOT ingested. Descriptive User-Agent per SEC policy. |
| Senate LDA lobbying | Implemented, automatic name refresh | Public API (Senate) | Registered lobbyist name, registrant firm, client, filing year | Federal registered lobbyists since 1999 | Low/medium | Federal lobbying-filing context. Registrant firm is an affiliation, not a residence. No-key official JSON API. |
| Buffalo building permits | Implemented, automatic name refresh | Public API (Socrata SoQL) | Permit applicant name, permit/work-site address, permit type, contractor-license context, issue date | City of Buffalo, NY permit applicants | Low/medium | Person-bearing via the `applicant` field (homeowner or licensed individual); contractor/business applicants are filtered out. The permit address is a work site or owner-occupied residence, not a confirmed residence. |
| Florida Sunbiz officers | Implemented, automatic name refresh | Official bulk (SFTP via lftp) | Officer/manager/registered-agent name, title, entity name/type/status, filing type/date | Florida corporation/LLC/LP officers | Medium | Public business-registry context only; entity affiliation is not a residence. Officer street addresses are deliberately not imported. Downloads the daily corp file per query (refresh-cached 1 day). |

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
| `mt_cadastral_parcels` | Approved for local ingestion | ArcGIS | Parcel owner name and owner mailing address (situs fields also present) | Montana statewide cadastral (all 56 counties) | High | Official MSDI cadastral framework (DNRC-hosted FeatureServer). Owner mailing address mapped; situs-vs-mailing role labeling pending before public display. MT allows owner nondisclosure, so some records may be suppressed. |
| `fl_fdor_statewide_parcels` | Approved for local ingestion | ArcGIS | Parcel owner name and owner mailing address (situs/physical fields also present) | Florida statewide cadastral (all 67 counties) | High | Official FDOR Property Tax Oversight statewide cadastral FeatureServer. Public record under Chapter 119 FS. Owner mailing address mapped; situs-vs-mailing role labeling pending before public display. |
| `maricopa_county_az_parcels` | Approved for local ingestion | ArcGIS | Parcel owner name and owner mailing address (situs fields also present) | Maricopa County, AZ (Phoenix metro) | High | Official Maricopa County Assessor public `Parcels` MapServer. Owner name not suppressed. Owner mailing address mapped; situs-vs-mailing role labeling pending before public display. |
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
- Status: `blocked/legal-review` (contract-gated; free CA data redacts owner names)
- Value: Very high (if a compliant license is obtained)
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
- Notes: Do not scrape county pages as a substitute for a license. ATTOM was evaluated as a candidate provider on 2026-06-20 and is license-blocked — see #50.

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
- Next step: BLOCKED 2026-06-20. Grantor/grantee indexes are published only as HTML search portals (San Mateo, Alameda, Orange, Charleston, Salt Lake, LA/Netronline) — no Socrata/API/JSON export found across the counties surveyed. NYC ACRIS deeds are already built separately (name-search adapter). Unblocks only if a county with a clean deed export/API is found.
- Notes: Avoid criminal/court-style records in this adapter. The formal grantor/grantee index is almost never exposed as a clean dataset.

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
- Next step: BLOCKED 2026-06-20. Every clean official endpoint requires credentials — the MA Professional Licensing API and IN PLA Verification API both need API keys; the CA State Bar QuickSearch redirects to a login (no public JSON API). NPPES already covers healthcare providers. Unblocks only with a licensed/keyed endpoint; do not scrape HTML board sites.
- Notes: Do not display disciplinary context without separate policy review. Third-party "scraper" APIs (StateLicense.io, Apify actors, etc.) are not official sources and must not be used.

### 5. `business-entity-registrations`

- Priority: P1
- Status: `ready-local` (Ohio #28 + Florida #40 — both built)
- Value: Medium/high
- Preserved information: Officers, registered agents, business/mailing addresses, company names, filing dates.
- Coverage: Statewide business owners/officers.
- Progress:
  - [~] Approval/terms: Ohio approved (HTTP CSV). FL/other states vary.
  - [x] Adapter: Ohio (`lib/sources/ohio-sos-business.ts`); a generic multi-state adapter remains planned.
  - [x] Loader/CLI: Ohio (`scripts/ingest-ohio-sos-business.ts`).
  - [ ] Config: per-state configs planned; Ohio is file-based (no config).
  - [x] Tests: Ohio tests exist.
  - [x] Docs: Ohio (#28) + Florida (#40) tracked.
  - [ ] Display policy: registered-agent and business addresses are not residences.
- Next step: Ohio is built (#28). Florida is ALSO built (#40) — the `fl-sunbiz` adapter ingests officers/managers/registered agents from the official daily bulk file via `lftp` (transport fixed 2026-06-20: the FL host rejects sshpass+sftp password auth, but lftp works). Live-verified (Smith→25 matched, 5 imported). This corrects an earlier "FL blocked (Cloudflare-gated layout)" note — the fixed-width layout was already implemented in the parser; only the transport was broken. Georgia (#41) and Washington SoS remain blocked (Cloudflare/Turnstile + paid FTP).
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
- Status: `ready-local` (Buffalo, NY instance built + live-verified 2026-06-20)
- Value: Medium
- Preserved information: Applicant name, permit/work-site address, dates, permit type, contractor-license context.
- Coverage: City of Buffalo, NY building permits (Socrata `9p2d-f3yt`, ~274k rows, key-free SoQL API). Extensible to other municipal permit datasets.
- Progress:
  - [x] Approval/terms: official City of Buffalo open data (Socrata); commercial/public republication remains operator responsibility.
  - [x] Adapter: `lib/sources/buffalo-permits.ts` — dedicated name-search adapter. Queries `starts_with(applicant,'<LAST>')` (uppercased, since the field is stored in caps), filters contractor/business applicants, and reorders surname-first names ("SMITH CLARA L" → "Clara L Smith").
  - [x] Loader/CLI: `scripts/ingest-buffalo-permits.ts` — `npm run ingest:buffalo-permits -- --last-name=Smith [--first-name=Clara] [--limit=n]`.
  - N/A Config: dedicated adapter (not config-driven).
  - [x] Tests: `tests/buffalo-permits.test.ts` (4 tests — mapping, first-name filter, business-name filter, short-name skip).
  - [x] Docs: tracked here.
  - [x] Display policy: location kind = "building permit applicant (permit/work site; not confirmed residence)"; confidence `Low`.
- Next step: optionally add more municipal permit datasets. Screened and rejected: Chicago (names are contractor *businesses*), SF (no applicant/owner field).
- Notes: Buffalo's `applicant` is genuinely person-bearing (homeowner or licensed individual). Wired into name-search auto-refresh in `lib/name-source-refresh.ts`. Live-verified: Smith→8, Garcia→1 imported.

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
- **Status:** configured (approved for local ingestion)
- **Value:** Statewide Montana parcel ownership with owner name + situs + mailing address — fills a major parcel gap (no MT source currently tracked).
- **Preserved information:** Owner name(s), property situs address, owner mailing address, assessed value, agricultural use, tax district, legal description, parcel geocode. (Note: MT allows owner nondisclosure requests, so some records may be suppressed.)
- **Coverage:** All 56 Montana counties; statewide; refreshed monthly per county.
- **Progress:**
  - [x] adapter: reuses configurable `arcgis` adapter (`lib/sources/arcgis.ts`)
  - [x] loader: reuses `npm run ingest:arcgis`
  - [x] config: `configs/property-sources/mt-cadastral-parcels.arcgis.json`
  - [x] tests: `npm run sources:validate-property` (live ArcGIS field verification) + existing arcgis adapter tests
  - [x] docs: row added to *Approved Property Sources Currently Configured*
  - [~] display-policy: owner mailing address mapped; situs vs mailing role labeling in UI pending
- **Next step:** Wire into a property-ingest run; decide situs-vs-mailing role labeling before public display.
- **Notes:** Public/open-data. Uses the DNRC-hosted statewide cadastral FeatureServer (`OwnerName`, `OwnerAddress1`, `OwnerCity`, `OwnerState`, `OwnerZipCode`). Monthly cadence good for freshness.

### 13. `hcad-harris-county-tx`
- **Priority:** P1
- **Status:** blocked — needs custom importer
- **Value:** ~2M accounts in Houston metro — one of the largest US county appraisal datasets; owner name + mailing + situs addresses free.
- **Preserved information:** Real & Personal Property DB: owner name, owner mailing address, property/situs address, account number, certified/preliminary appraised values; GIS shapefiles keyed by APN (quarterly).
- **Coverage:** Harris County, TX (Houston metro), ~2M+ accounts.
- **Progress:**
  - [ ] adapter: `lib/sources/hcad.ts` (custom — fixed-width parser required)
  - [ ] loader: `scripts/ingest-hcad.ts`
  - [ ] config: `configs/hcad.json`
  - [ ] tests: `lib/sources/__tests__/hcad.test.ts`
  - [ ] docs
  - [ ] display-policy: mailing vs situs role labeling
- **Next step:** HCAD distributes fixed-width text files (not ArcGIS/delimited), so it does not fit any existing configurable adapter. Build a dedicated `lib/sources/hcad.ts` fixed-width importer against the hcad.org/pdata layouts (Real Acct + Owner + Situs + Building), then an ingest script. Deferred from the config-based batch.
- **Notes:** Free, no registration. Quarterly GIS. Marked blocked-from-config-path (not a legal block) — needs the custom importer above.

### 14. `fl-fdor-statewide-parcels`
- **Priority:** P1
- **Status:** configured (approved for local ingestion)
- **Value:** All 67 FL counties via FDOR tax roll + FGIO statewide parcel layer — statewide Florida coverage not currently tracked (Cook/DeKalb/Racine/Cedar Rapids/WI are).
- **Preserved information:** Owner name, mailing address, situs address, sales data, valuations, building info, parcel/folio ID.
- **Coverage:** Statewide Florida, all 67 counties.
- **Progress:**
  - [x] adapter: reuses configurable `arcgis` adapter (`lib/sources/arcgis.ts`)
  - [x] loader: reuses `npm run ingest:arcgis`
  - [x] config: `configs/property-sources/fl-fdor-statewide-parcels.arcgis.json`
  - [x] tests: `npm run sources:validate-property` (live ArcGIS field verification) + existing arcgis adapter tests
  - [x] docs: row added to *Approved Property Sources Currently Configured*
  - [~] display-policy: owner mailing address mapped; situs vs mailing role labeling in UI pending
- **Next step:** Wire into a property-ingest run; decide situs-vs-mailing role labeling before public display.
- **Notes:** Public record (Chapter 119 FS). Uses the FDOR Property Tax Oversight statewide cadastral FeatureServer (all 67 counties; `OWN_NAME`, `OWN_ADDR1`, `OWN_CITY`, `OWN_STATE`, `OWN_ZIPCD`).

### 15. `irs-form-990-officers`
- **Priority:** P1
- **Status:** `ready-local` (batch/file model; no live per-lookup API)
- **Value:** Every e-filed 990 lists ALL current officers/directors/trustees with full name, title, compensation, and business address — ~1.5M nonprofits, hundreds of millions of officer-year records.
- **Preserved information:** Part VII PersonNm, TitleTxt, ReportableCompFromOrgAmt/OtherCompensationAmt, business address group (street/city/state/ZIP); EIN, org name/address.
- **Coverage:** All US tax-exempt orgs e-filing 990 series; ~2010/2011-present, monthly.
- **Progress:**
  - [x] adapter: `lib/sources/irs-990.ts`
  - [x] loader: `scripts/ingest-irs-990.ts (XML Part VII parser)
  - [~] config: `configs/irs-990.json` (N/A — file-based adapter)
  - [x] tests
  - [ ] docs
  - [ ] display-policy: business (not residential) address labeling
- **Next step:** No clean no-key per-lookup path exposes officer names. ProPublica Nonprofit Explorer search returns organizations (no officer names) and the per-filing XML is behind a Cloudflare bot-challenge (403). The only no-key route is the IRS TEOS multi-GB monthly ZIP bulk archive + CSV index (download, extract Part VII officer names, index locally) — a batch-ingest design, not a live lookup adapter. Build a batch loader if this source is pursued.
- **Notes:** US Gov public record, no copyright. Blocked only on access architecture, not legality.

### 16. `nih-reporter`
- **Priority:** P1
- **Status:** configured (approved for local ingestion)
- **Value:** Richest biomedical PI dataset — named contact PI + all PIs, org name+address, across NIH/CDC/FDA/AHRQ/VA/EPA; back to 1970.
- **Preserved information:** PI and contact PI full name (+ profile ID), project leader, applicant org name+address+city/state, award/project numbers, costs, title/abstract, linked publications/patents.
- **Coverage:** All NIH-funded + participating HHS/other agency projects FY1985-present (ExPORTER to FY1970).
- **Progress:**
  - [x] adapter: `lib/sources/nih-reporter.ts` (RePORTer v2 POST `/projects/search` by PI name)
  - [x] loader: `npm run ingest:nih-reporter`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/nih-reporter.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: institution shown as scholarly-affiliation context; grant affiliation is not residential
- **Next step:** Bulk-load ExPORTER yearly CSV for historical depth; consider per-project records (one PI currently stores its representative/latest project).
- **Notes:** US Gov public domain; API no key required. Creates one context profile per matching PI; project renders as a structured work via `lib/profile-source-records.ts`.

### 17. `tn-comptroller-parcels`
- **Priority:** P1
- **Status:** blocked/legal review
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
- **Next step:** Request a token/data agreement from the TN Comptroller for the token-gated `STATEWIDE_PARCELS_WEB_MERCATOR` MapServer (fields known: `OWNER`, `OWNER2`, `ADDRESS`, `CITY`, `STATE`, `ZIP`, `PARCELID`, `GISLINK`), or fall back to per-county open FeatureServers (Davidson/Metro Nashville, Knox/KGIS, Shelby, Hamilton) as separate tracker entries.
- **Notes:** The only official owner-attribute layer (`https://tnmap.tn.gov/arcgis/rest/services/CADASTRAL/STATEWIDE_PARCELS_WEB_MERCATOR/MapServer/0`) is token-gated (HTTP 499; anonymous token generation rejected — credentials minted server-side only). The AGOL "Tennessee Property Boundaries Public Use" item is a VectorTileServer with no attributes. Not anonymously importable as-is.
- **Notes:** State open data, free, no registration.

### 18. `nsf-award-search`
- **Priority:** P1
- **Status:** configured (approved for local ingestion)
- **Value:** Named PIs/co-PIs + institution addresses across all NSF STEM awards (~1960s-present); explicitly public domain, no-key API.
- **Preserved information:** PI/co-PI first+last name, org name+city/state/ZIP, award title/abstract, program/directorate, amounts/dates.
- **Coverage:** All NSF-funded awards nationwide; tens of thousands of awards.
- **Progress:**
  - [x] adapter: `lib/sources/nsf-award-search.ts` (NSF Award Search API `/services/v1/awards.json` by PI name)
  - [x] loader: `npm run ingest:nsf-award-search`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/nsf-award-search.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: institution shown as scholarly-affiliation context; grant affiliation is not residential
- **Next step:** Ingest the Jan-2025 JSON bulk archive for historical depth; consider per-co-PI records (currently one profile per primary PI with its representative award).
- **Notes:** Explicit public-domain statement; ideal lawful grant source. Award renders as a structured work via `lib/profile-source-records.ts`.

### 19. `nyc-acris-deeds`
- **Priority:** P1
- **Status:** configured (approved for local ingestion)
- **Value:** NYC recorded deed/mortgage parties (grantor/grantee) tie named individuals to NYC property — complements existing county recorder deed index family with a major metro.
- **Preserved information:** Real property document parties (grantor/grantee names), doc type, recording date, property address/lot, document images.
- **Coverage:** Manhattan, Bronx, Brooklyn, Queens (Staten Island/Richmond separate).
- **Progress:**
  - [x] adapter: `lib/sources/nyc-acris-deeds.ts` (dedicated adapter; SODA Parties `636b-3b5g` + Legals `8h5j-fqxa`)
  - [x] loader: `npm run ingest:nyc-acris-deeds`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/nyc-acris-deeds.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: party-role (grantor/grantee) labeling; address is property/recorded, not current residence
- **Next step:** Decide public-display policy for recorded addresses before production.
- **Notes:** NYC open data. Party name (LAST, FIRST) flipped to FIRST LAST; mailing city/state used, falling back to the linked Legals property address.

### 20. `maricopa-county-az-parcels`
- **Priority:** P1
- **Status:** configured (approved for local ingestion)
- **Value:** Largest US county parcel dataset by population (Phoenix metro); owner name + situs via Assessor data.
- **Preserved information:** Parcel shapefile countywide keyed by APN; assessor identification/classification/valuation attributes; owner name + situs.
- **Coverage:** Maricopa County, AZ; updated daily/weekly.
- **Progress:**
  - [x] adapter: reuses configurable `arcgis` adapter (`lib/sources/arcgis.ts`)
  - [x] loader: reuses `npm run ingest:arcgis`
  - [x] config: `configs/property-sources/maricopa-county-az-parcels.arcgis.json`
  - [x] tests: `npm run sources:validate-property` (live ArcGIS field verification) + existing arcgis adapter tests
  - [x] docs: row added to *Approved Property Sources Currently Configured*
  - [~] display-policy: owner mailing address mapped; situs vs mailing role labeling in UI pending
- **Next step:** Wire into a property-ingest run; decide situs-vs-mailing role labeling before public display.
- **Notes:** Uses the official Maricopa County Assessor public `Parcels` MapServer (owner name NOT suppressed; `OWNER_NAME` + `MAIL_ADDR1/MAIL_CITY/MAIL_STATE/MAIL_ZIP`).
- **Notes:** County GIS open data, free.

### 21. `uspto-trademark-owners`
- **Priority:** P1
- **Status:** `excluded` (API-key-required; excluded under the no-key policy — see Collection Rules. Adapter/loader/tests retained on disk, de-activated from auto-refresh and ingest scripts.)
- **Value:** Trademark owner/applicant full name + applicant address (street/city/state) for individual applicants — direct named-person-to-address link.
- **Preserved information:** Owner/applicant name, entity type, applicant address, correspondence address, attorney of record, mark, filing/registration dates, status.
- **Coverage:** All US federal trademark applications/registrations; decades of records; daily front files + backfile.
- **Progress:**
  - [x] adapter: `lib/sources/uspto-trademark.ts`
  - [x] loader: `scripts/ingest-uspto-trademark.ts
  - [~] config: `configs/uspto-trademark.json` (N/A — query adapter)
  - [x] tests
  - [ ] docs
  - [ ] display-policy: distinguish individual vs entity applicant
- **Next step:** Use USPTO Open Data Portal (data.uspto.gov) free bulk; optional TSDR API key for prosecution history.
- **Notes:** US Gov public data, no copyright.

### 22. `uspto-patent-inventors`
- **Priority:** P2
- **Status:** `excluded` (API-key-required; excluded under the no-key policy — see Collection Rules. Adapter/loader/tests retained on disk, de-activated from auto-refresh and ingest scripts.)
- **Value:** All US patent inventors (1976-present) with name + city/state + assignee; PatentsView disambiguation; no street address so moderate precision.
- **Preserved information:** Per inventor full name, city/state/country, assignee; PatentsView: disambiguated inventor_id, cleaned names, geocoded location.
- **Coverage:** All US patent grants (1976+) and applications (2001+).
- **Progress:**
  - [x] adapter: `lib/sources/uspto-patent.ts`
  - [x] loader: `scripts/ingest-uspto-patent.ts
  - [~] config: `configs/uspto-patent.json` (N/A — query adapter)
  - [x] tests
  - [ ] docs
  - [ ] display-policy: city/state-only precision note
- **Next step:** No no-key public inventor-name API remains. PatentsView v3 requires a free `X-Api-Key`, and the USPTO Open Data Portal requires a USPTO.gov login (as of 2026-06-18). To unblock: add an optional-key store and build against PatentsView v3, or ingest the USPTO ADV0/APP0 bibliographic bulk files (large, offline) instead of a live API.
- **Notes:** All live search APIs now require registration/login → blocked under the no-key rule. City/state only, no street.

### 23. `ar-gis-office-parcels`
- **Priority:** P2
- **Status:** blocked — adapter limitation
- **Value:** Statewide Arkansas landowner/parcel attribution — fills AR parcel gap.
- **Preserved information:** Statewide landowner/parcel attribution searchable by owner and parcel.
- **Coverage:** Statewide Arkansas.
- **Progress:**
  - [ ] adapter: needs constant-state support in `arcgis` adapter (see Notes)
  - [ ] loader: reuses `npm run ingest:arcgis` once adapter supports it
  - [~] config: endpoint + fields identified; config withheld to avoid bad data
  - [ ] tests
  - [ ] docs
  - [ ] display-policy
- **Next step:** Add optional constant/override-state support to `lib/sources/arcgis.ts` (and relax the validator's required `fields.state` when an override is set), then create `configs/property-sources/ar-gis-office-parcels.arcgis.json` mapping `parcelid`/`ownername`/situs address with `state` overridden to `AR`.
- **Notes:** Endpoint found and live-verified: `https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6` (`PARCEL_POLYGON_CAMP`, ~2.1M parcels, public, no auth). BUT the layer is **situs-only** (no owner mailing fields) and has **no state column** (all records are AR). The current `arcgis` adapter reads `state` from a mapped field and rejects empty states, so mapping `state`→`county` would ingest county names as state — rejected as bad data. Needs the constant-state adapter enhancement before this (and other statewide, no-state-column) sources can be ingested correctly.

### 24. `va-nationwide-gravesite-locator`
- **Priority:** P2
- **Status:** blocked/legal review (HTML-only, no API)
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
- **Status:** configured (approved for local ingestion)
- **Value:** ~300k NYC municipal employees per fiscal year with full names — large named-individual public-payroll set; Socrata adapter likely already exists.
- **Preserved information:** First/last/middle name, agency, agency start date, work location borough, title, base/gross pay, fiscal year.
- **Coverage:** All active NYC municipal employees; ~300k+/fy; multiple historical years.
- **Progress:**
  - [x] adapter: `lib/sources/nyc-payroll.ts` (dedicated adapter; SODA JSON `k397-673e`)
  - [x] loader: `npm run ingest:nyc-payroll`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/nyc-payroll.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: agency shown as public-payroll affiliation; NOT a residence
- **Next step:** Decide public-display policy for salary amounts before production; confirm refresh cadence.
- **Notes:** Built as a dedicated adapter (payroll has no residential city/state, so the Socrata *config* adapter's required address fields don't fit). Work-borough/agency context, NOT residence.

### 26. `chicago-current-employee-salaries`
- **Priority:** P2
- **Status:** configured (approved for local ingestion)
- **Value:** ~30k Chicago employees with full names + departments; Socrata adapter reuse.
- **Preserved information:** Full name, department, position/title, employment status, annual salary or hourly rate.
- **Coverage:** All active City of Chicago employees (~30k+).
- **Progress:**
  - [x] adapter: `lib/sources/chicago-salaries.ts` (dedicated adapter; SODA JSON `xzkq-xp2w`)
  - [x] loader: `npm run ingest:chicago-salaries`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/chicago-salaries.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: department shown as public-payroll affiliation; NOT a residence
- **Next step:** Decide public-display policy for salary amounts before production.
- **Notes:** Dedicated adapter (no residential fields). Department = workplace context.

### 27. `florida-state-employee-salaries`
- **Priority:** P2
- **Status:** configured (approved for local ingestion)
- **Value:** FL state personnel + courts employees with full names + titles; official CSV export.
- **Preserved information:** Last/first/middle name, agency, budget entity, position, employee type, class title, state hire date, salary.
- **Coverage:** FL State Personnel System agencies, Lottery, JAC, State Courts; sibling university portal exists.
- **Progress:**
  - [x] adapter: `lib/sources/florida-salaries.ts` (dedicated adapter; official CSV from salaries.myflorida.com)
  - [x] loader: `npm run ingest:florida-salaries`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/florida-salaries.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: agency shown as public-payroll affiliation; NOT a residence
- **Next step:** Decide public-display policy for salary amounts before production; confirm refresh cadence.
- **Notes:** FL public-record transparency data. Dedicated adapter with an RFC-4180 CSV parser.

### 28. `ohio-sos-monthly-business-reports`
- **Priority:** P2
- **Status:** `ready-local` (batch/file model; bulk CSV)
- **Value:** Concrete OH instance of business-entity-registrations family with free monthly bulk path — officer/manager/registered-agent name+address.
- **Preserved information:** Officer/manager/registered-agent name+address, entity name/type/status, formation date, filing type.
- **Coverage:** All new+updated OH business entity filings; monthly.
- **Progress:**
  - [x] adapter: `lib/sources/ohio-sos-business.ts`
  - [x] loader: `scripts/ingest-ohio-sos-business.ts
  - [~] config: `configs/ohio-sos-business.json` (N/A — file-based adapter)
  - [x] tests
  - [ ] docs
  - [ ] display-policy: business/contact address role labeling
- **Next step:** Pull free monthly CSV from ohiosos.gov/business/business-reports.
- **Notes:** Registered-agent/officer addresses are business/contact, NOT residences.

### 29. `doj-fara-registrants`
- **Priority:** P2
- **Status:** blocked/legal review (bulk-only)
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
- **Status:** configured (approved for local ingestion)
- **Value:** Named federal lobbyists (tens of thousands since 1999) tied to firms/clients/addresses; distinct from FEC Schedule A.
- **Preserved information:** Registered lobbyist full names, client, registrant/firm, covered government positions, firm business address.
- **Coverage:** All federally registered lobbyists/clients since 1999; quarterly.
- **Progress:**
  - [x] adapter: `lib/sources/senate-lda.ts` (Senate LDA API `/api/v1/filings/?lobbyist_name=`)
  - [x] loader: `npm run ingest:senate-lda`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/senate-lda.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: registrant firm shown as lobbying-filing affiliation; NOT a residence
- **Next step:** Decide public-display policy before production; optionally cross-ref House Clerk filings.
- **Notes:** No-key official JSON API. One profile per matching lobbyist; registrant firm + client + year preserved. Distinct from FEC Schedule A.

### 31. `sec-edgar-insiders`
- **Priority:** P2
- **Status:** configured (approved for local ingestion)
- **Value:** SEC insiders (officers/directors/10% owners) named with addresses (often residential) on Forms 3/4/5 + executive rosters in DEF 14A/10-K.
- **Preserved information:** Reporting person full name, relationship (officer/director/10% owner), address; proxy/10-K named executives.
- **Coverage:** All SEC-reporting company insiders; millions of 3/4/5 events since 1993/2001.
- **Progress:**
  - [x] adapter: `lib/sources/sec-edgar-insiders.ts` (EDGAR full-text search `efts.sec.gov` forms 3/4/5 + per-filing Form 4 XML role enrichment)
  - [x] loader: `npm run ingest:sec-edgar-insiders`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/sec-edgar-insiders.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: issuer affiliation only; NO residential address surfaced (addresses deliberately omitted). Descriptive User-Agent set per SEC policy.
- **Next step:** Decide public-display policy for insider/role data before production; respect SEC fair-access rate limits.
- **Notes:** No-key; descriptive EDGAR User-Agent is attribution, not auth. Only issuer + role + filing year preserved; residential addresses are NOT ingested.

### 32. `ssa-death-master-file`
- **Priority:** P1 (high value, gated)
- **Status:** blocked/legal review (commercial-only)
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
- **Status:** blocked/legal review
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
- **Next step:** Owner name + mailing address are not in any public ArcGIS layer (suppressed under CA Gov. Code §6254.21). Full owner/mailing data is only via the Assessor Portal paid/formal data request — pursue that path or confirm the licensed CA property feed already covers LA County before building.
- **Notes:** The only public no-login layer (`https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0`) carries situs address + AIN but **no owner-name and no mailing-address field** and no state column (CA implied). Not anonymously importable for owner lookup; the ArcGIS config validator cannot be satisfied honestly. Situs-only mapping also can't pass the validator (no `name`/`state` remote fields).

### 34. `reclaim-the-records-death-indexes`
- **Priority:** P2
- **Status:** blocked/legal review (bulk-only)
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
- **Status:** blocked/legal review (bulk-only)
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
- **Status:** blocked/legal review (bulk/bot-gated)
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
- **Status:** blocked/legal review (APEX/bot-gated)
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
- **Status:** blocked/legal review (account + ToS)
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
- **Status:** `ready-local` (batch/file model; bulk CSV)
- **Value:** Named FAA-certificated airmen with mailing address (unless opted out) — but growing opt-out share degrades address coverage.
- **Preserved information:** Airman full name, certificate number, certificate type(s)/ratings, mailing address (street/city/state/ZIP unless opted out).
- **Coverage:** All FAA-certificated airmen; hundreds of thousands; periodic updates.
- **Progress:**
  - [x] adapter: `lib/sources/faa-airmen.ts`
  - [x] loader: `scripts/ingest-faa-airmen.ts
  - [~] config: `configs/faa-airmen.json` (N/A — file-based adapter)
  - [x] tests
  - [ ] docs
  - [ ] display-policy: honor opt-out; suppress withheld addresses; label name-only records
- **Next step:** Ingest official FAA Releasable Airmen Download; implement opt-out/withheld-address handling.
- **Notes:** CONDITIONAL — Privacy Act SORN; airmen may opt out of address (name stays public). Growing withheld share.

### 40. `fl-sunbiz-business-entity-search`
- **Priority:** P2
- **Status:** `ready-local` (built + live-verified 2026-06-20; transport fixed sshpass→lftp)
- **Value:** FL (large entity registry) officers/managers/registered agents — direct named-person-to-entity affiliation.
- **Preserved information:** Officer/manager/registered-agent name + title, entity name/type/status, filing type/date. Officer street addresses are deliberately NOT imported (residential).
- **Coverage:** All FL corporations, LLCs, LPs via the official Division of Corporations daily bulk file.
- **Progress:**
  - [x] adapter: `lib/sources/fl-sunbiz.ts` (fixed-width parser + officer matcher)
  - [x] loader: `scripts/ingest-fl-sunbiz.ts` (`npm run ingest:fl-sunbiz`)
  - N/A config: dedicated adapter (no config)
  - [x] tests: `tests/fl-sunbiz.test.ts` (4 tests)
  - [x] docs: tracked here + registry table
  - [x] display-policy: affiliation context only; officer addresses not imported
- **Next step:** Live-verified (Smith→25 matched, 5 imported from the 20260620 daily file). Wired into name-search auto-refresh. Monitor SFTP download load at scale; move to CLI bulk if per-query download proves too heavy.
- **Notes:** Official FL Division of Corporations public bulk data via documented public SFTP (`sftp.floridados.gov`, user `Public`). Transport uses `lftp` because the host rejects non-interactive password auth over plain `sftp` (sshpass+sftp fails). Entity affiliation and officer role are NOT residential/contact evidence. This corrects an earlier "blocked (Cloudflare-gated layout)" note — the fixed-width layout was already implemented in the parser.

### 41. `ga-corporations-division-ecorp`
- **Priority:** P3
- **Status:** blocked/legal review (bot-gated + paid bulk)
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
- **Next step:** All eCorp endpoints (incl. robots) sit behind a Cloudflare managed-challenge (HTTP 403 to programmatic access) with no documented automated-access permission; the only structured alternative is the paid GTA Bulk Corporations Data FTP subscription ($1,000 / $500-mo + signed agreement). To unblock: obtain licensed bulk access or a permitted API path.
- **Notes:** No no-key public per-lookup or structured path. Addresses would be business/contact.

### 42. `wa-sos-ccfs-corporations-search`
- **Priority:** P3
- **Status:** blocked/legal review (Turnstile-gated + paid bulk)
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
- **Next step:** The CCFS API (`ccfs-api.prod.sos.wa.gov`) requires a browser-issued Turnstile/reCAPTCHA token on every search/details call (HTTP 400 "System verification" without it); the public advanced-search form has no officer-name field; Data.WA.gov Socrata view returns 403; bulk data is a paid IACA subscription. To unblock: obtain licensed bulk access or a permitted API path.
- **Notes:** No no-key public per-lookup or structured path. Addresses would be business/contact. See `[[wa-sos-ccfs-blocked]]`.

### 43. `chronicling-america-newspaper-obituaries`
- **Priority:** P3
- **Status:** configured (approved for local ingestion)
- **Value:** Official LoC newspaper-archive API with OCR obituary text (name, DOD, relatives, residence) — but pre-1964 focus + needs NLP parsing.
- **Preserved information:** Obituary/death-notice OCR text: deceased name, date/place of death, surviving relatives, city/neighborhood of residence, burial location; page images.
- **Coverage:** Historic US newspapers 1758-1963; ~20M+ pages from 4,000+ titles.
- **Progress:**
  - [x] adapter: `lib/sources/chronicling-america.ts` (loc.gov API `fo=json`; legacy chroniclingamerica.loc.gov API retired 2025)
  - [x] loader: `npm run ingest:chronicling-america`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/chronicling-america.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: weak OCR match → confidence Low; publication context only, NOT a residence; no NLP death-date/relative extraction yet
- **Next step:** Optionally add NLP obituary extraction (death date, relatives) and deceased-profile merge.
- **Notes:** Public domain. Strict name-token filter against OCR text; one representative clipping per name; publication city/state is context, not residence.

### 44. `sam-gov-entity-registrations`
- **Priority:** P3
- **Status:** `excluded` (API-key-required; excluded under the no-key policy — see Collection Rules. Adapter/loader/tests retained on disk, de-activated from auto-refresh and ingest scripts.)
- **Value:** Federal contractor/grantee entities with named POCs + addresses — entity-centric so individuals appear only as POCs (indirect).
- **Preserved information:** Legal business name, DBA, physical+mailing address, UEI, registration expiration, named POC (phone/email), congressional district; exclusions (debarred, named+address).
- **Coverage:** All entities registered to do business with US federal government; hundreds of thousands; daily/monthly extracts.
- **Progress:**
  - [x] adapter: `lib/sources/sam-gov.ts`
  - [x] loader: `scripts/ingest-sam-gov.ts
  - [~] config: `configs/sam-gov.json` (N/A — query adapter)
  - [x] tests
  - [ ] docs
  - [ ] display-policy: POC-role labeling (organization-centric)
- **Next step:** Use SAM.gov Data Services public entity/exclusions extracts (Entity/Exclusions Extracts API).
- **Notes:** CONDITIONAL — named individuals appear only as POCs, not as registered subject; identity context indirect.

### 45. `usda-nifa-cris`
- **Priority:** P3
- **Status:** blocked/legal review (no public API)
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
- **Next step:** CRIS pages are retired (redirect to the NIFA Data Gateway JS app with no JSON API); live PI data now sits behind the authenticated REEport/NIFA Reporting System. To unblock: obtain a structured bulk export or authenticated feed and confirm reuse terms. USAspending.gov (no-key) was evaluated but carries no investigator/PI name field, so it cannot serve as a person source.
- **Notes:** No no-key public path exposes investigator names. NIH RePORTer + NSF Award Search remain the only working federal-research-PI person sources.

### 46. `doe-pams-award-search`
- **Priority:** P3
- **Status:** blocked/legal review (no public API)
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
- **Next step:** PAMS public search (`pamspublic.science.energy.gov`) is a session-bound Telerik WebForms app with no stable JSON contract; driving it requires replaying JS-generated viewstate/cookies (brittle scraping). USAspending.gov has no PI name field. To unblock: wait for a documented DOE awards-by-PI JSON API, or accept an explicit HTML-scraping exception with ToS/robots review.
- **Notes:** No clean no-key person-name API. Lowest quality of grant sources; partial coverage.

### 47. `seethroughny-payrolls`
- **Priority:** P3
- **Status:** configured (approved for local ingestion)
- **Value:** NY state/local payroll names — but nonprofit republisher; prefer upstream official feeds.
- **Preserved information:** Employee name, position/title, employer (NYS/NYC/authority/local gov), base pay, total pay, year.
- **Coverage:** NYS, NYC, public authorities, NY local gov; state payroll 2008-2023.
- **Progress:**
  - [x] adapter: `lib/sources/seethroughny-payrolls.ts` (dedicated adapter; JSON endpoint with Referer header)
  - [x] loader: `npm run ingest:seethroughny-payrolls`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/seethroughny-payrolls.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: employer shown as public-payroll affiliation; NOT a residence
- **Next step:** Review seethroughny.net terms-of-use for automated republication before public display.
- **Notes:** Nonprofit republisher (FOIL-derived NY data). Employer = workplace context.

### 48. `uc-annual-wage`
- **Priority:** P3
- **Status:** configured (approved for local ingestion)
- **Value:** UC system employee pay with names — but search-only, no bulk; HTML permission required.
- **Preserved information:** Employee name, UC campus/location, job title/category, annual pay, year.
- **Coverage:** All UC campuses + UCOP; multiple years.
- **Progress:**
  - [x] adapter: `lib/sources/uc-annual-wage.ts` (dedicated adapter; official UCOP `/wage/search` JSON)
  - [x] loader: `npm run ingest:uc-annual-wage`
  - [x] wired into automatic name search: `lib/name-source-refresh.ts`
  - [x] tests: `tests/uc-annual-wage.test.ts`
  - [x] docs: row added to *Existing Person/Profile Sources*
  - [~] display-policy: campus shown as public-payroll affiliation; NOT a residence
- **Next step:** Decide public-display policy for salary amounts before production.
- **Notes:** Official UC Office of the President disclosure; no-key JSON search. Campus = workplace context.

### 49. `incogni-data-broker-coverage-list`

- **Priority:** P4
- **Status:** `blocked/legal-review`
- **Value:** Reference-only map of data brokers and people-search sites used by a privacy-removal service; useful for opt-out/suppression workflow planning and licensed-provider outreach, not as profile data.
- **Preserved information:** Broker/site name, public website or opt-out URL where listed, Incogni-provided sensitivity score, category, and coverage label. No person names, phones, emails, addresses, search terms, or profile records may be imported.
- **Coverage:** Incogni's public list of covered data brokers and people-search sites across US, Canada, and EU/UK/EEA-adjacent coverage labels. Incogni says the list can change and continues expanding.
- **Progress:**
  - [ ] Approval/terms: not approved. Incogni's terms position the service as personal-use removal-request tooling, say the covered-broker list can change, and reserve website intellectual property; written permission or a separate license is required before any automated reuse.
  - [ ] Adapter: blocked; do not scrape Incogni or any listed broker site.
  - [ ] Loader/CLI: blocked; do not build ingestion.
  - [x] Config: reference-only metadata exists at `configs/reference-sources/incogni-data-broker-coverage.reference.json`.
  - N/A Tests: no adapter or loader exists; add tests only if a future approved opt-out registry format is created.
  - [x] Docs: tracked here and in `docs/data-source-quality-ranking.md`.
  - [ ] Display policy: do not display broker-derived personal data; use only as internal opt-out/suppression/provider-research reference after legal approval.
- **Next step:** If this remains useful, design an opt-out/broker-registry data model that stores broker names, categories, legal basis, opt-out endpoints, and suppression workflow status only; seed it from official state data broker registries or licensed/permissioned directories, not Incogni scraping.
- **Notes:** This is not an approved public, official, records-request, or licensed profile source. Do not add an Incogni-covered people-search site as a source unless that individual site independently passes the approval workflow and has explicit automated-access/reuse rights.

### 50. `attom-licensed-property-provider`

- **Priority:** P3
- **Status:** `blocked/legal-review` (license — not technology)
- **Value:** National property/owner-data aggregator (158M+ properties: owner name, situs/mailing address, APN, tax/assessment, deed/mortgage). One candidate provider for the generic `licensed-california-property-feed` (#1) and its national equivalent.
- **Preserved information:** None under the available license. The data ATTOM *offers* (owner name, property/mailing address) is the same county recorder/assessor data already sourced lawfully from official ArcGIS/Socrata parcel APIs (#2).
- **Coverage:** United States (national). API key required; free 30-day trial then transaction-based custom enterprise pricing (~$10k+/mo for full nationwide per third-party reports).
- **Progress:**
  - [ ] Approval/terms: BLOCKED. ATTOM Developer Platform Terms (V07052018, updated 2024-11-21) prohibit every element of this product's use under the available license:
    - §1.2 — license is "internal evaluation only" and expressly excludes "any form of commercial exploitation or revenue generation whatsoever" (rules out ad-supported public display).
    - §1.3(iii) — prohibits "using the ATTOM Products to create, enhance or structure any database in any form" (rules out ingestion into our store).
    - §1.3(iv) — prohibits "publishing… or creating any product or service for… distribution to any third party" (rules out serving on a public website).
    - §1.3(vi) — prohibits caching/storing ATTOM Content "for a period of greater than twenty-four (24) hours" (rules out persistent storage).
    - §4.1 — 90-day initial term; on termination customer must purge/delete and certify destruction.
  - [ ] Adapter: blocked; no `lib/sources/attom-*.ts` (building it would facilitate a terms breach).
  - [ ] Loader/CLI: blocked; no `scripts/ingest-attom-*.ts`.
  - [x] Config: reference-only metadata at `configs/reference-sources/attom-property-data.reference.json`.
  - N/A Tests: no adapter or loader exists.
  - [x] Docs: tracked here; cross-references `licensed-california-property-feed` (#1).
  - [ ] Display policy: blocked; no display.
- **Next step:** Unblocking requires a separately negotiated ATTOM **Order Form** that explicitly grants (a) commercial/ad-supported use, (b) database ingestion, (c) public redistribution/display, and (d) >24h persistent storage — rights the default terms expressly withhold. ATTOM markets to real estate/insurance/marketing, not public people-search, and may decline people-lookup use; even if granted, cost is high and the underlying data duplicates official parcel sources already in use. Recommend NOT pursuing unless a confirmed license is in hand.
- **Notes:** Audited 2026-06-20 as part of the Incogni broker-list review (ATTOM was the only licensed-aggregator candidate on that list). The ATTOM path is license-blocked, not technology-blocked. The property data ATTOM aggregates is already sourced directly from official county/state APIs (#2), so ATTOM offers no unique lawful value at materially higher cost and legal risk.

### 51. `wa-pdc-campaign-contributions`

- **Priority:** P3
- **Status:** `ready-local` (local ingest via config; public display gated pending campaign-finance display-policy review)
- **Value:** Washington State individual campaign-finance donors — complements federal FEC Schedule A (#6) at the state level.
- **Preserved information:** Individual donor name, contribution address (street/city/state/ZIP), receipt date, amount/committee context.
- **Coverage:** Washington State individual contributors, 2025+ (recency filter).
- **Progress:**
  - [x] Approval/terms: Washington public record; Socrata keyless open data; reuse permitted. Local ingest approved; public display gated (same review as FEC Schedule A).
  - N/A Adapter: reuses generic `lib/sources/socrata.ts` (enhanced to support per-config `locationKind`/`confidence`).
  - [x] Loader/CLI: `npm run ingest:socrata -- --config=configs/person-sources/wa-pdc-contributions.socrata.json`.
  - [x] Config: `configs/person-sources/wa-pdc-contributions.socrata.json` (validated; 7 fields verified live).
  - N/A Tests: covered by generic socrata adapter tests.
  - [x] Docs: tracked here.
  - [ ] Display policy: do NOT surface donor data on the public site until the campaign-finance display-policy review is complete.
- **Next step:** Live-verified (50-row sample → 47 imported; e.g., "Killin Selena", Edmonds WA). Raise the limit / schedule periodic re-ingest for fresher data; keep public display gated.
- **Notes:** Bulk config source (not in name-search auto-refresh). `contributor_category='Individual'` filters out organizational donors; `receipt_date>'2025-01-01'` enforces the recency priority ("value recent data").

## Immediate Recommended Backlog

Highest-leverage new sources (public record, free bulk/API, no scraping, no license negotiation) discovered 2026-06-19 — full quality ranking in `docs/data-source-quality-ranking.md`:

1. `irs-form-990-officers` — ~1.5M nonprofits; named officers/directors + business address from one XML schema; monthly bulk.
2. `fl-fdor-statewide-parcels` — all 67 FL counties; owner + mailing + situs addresses.
3. `hcad-harris-county-tx` — ~2M Houston-metro accounts; free bulk text + shapefiles.
4. `nih-reporter` + `nsf-award-search` — named federal-grant PIs + institution address; public-domain APIs.
5. `nyc-acris-deeds` — NYC grantor/grantee deed parties tied to property.

Existing priorities:

6. Decide display/legal policy for `fec-schedule-a-individual-contributions`.
7. Evaluate `licensed-california-property-feed` terms and sample schema. (ATTOM ruled out — license-blocked, see #50.)
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
