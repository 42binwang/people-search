# Search People Website Requirements

Last updated: 2026-06-18

## 1. Product Summary

Build a free, ad-supported public lookup website similar in broad search experience to TruePeopleSearch. Users can search by name, phone number, email address, or address and view possible public-record profile matches.

The product must be designed as a privacy-conscious public lookup service, not as a background-check, eligibility-screening, tenant-screening, employment-screening, credit, insurance, or investigative decision product.

## 2. Business Model

- The site is free for users.
- Monetization comes from display advertising.
- No paid reports in MVP.
- No public API in MVP.
- Future monetization options can be evaluated later, but they must not weaken privacy, abuse controls, or FCRA boundaries.

## 3. Core Principles

- Use only lawful, licensed, contractually permitted, or public-domain/public-record data sources.
- Treat privacy and safety controls as core product features.
- Show confidence and uncertainty clearly where possible.
- Keep data provenance for every displayed field.
- Provide a clear, fast opt-out and correction process.
- Do not expose data in ways that help scraping, stalking, harassment, identity theft, or regulated screening.
- Do not pass searched names, phone numbers, addresses, emails, or profile data to ad vendors.

## 4. MVP Scope

### In Scope

- Public homepage.
- Name search.
- Reverse phone lookup.
- Reverse email lookup.
- Reverse address lookup.
- Search results pages.
- Person profile pages.
- Opt-out/removal flow.
- Correction/dispute flow.
- Abuse reporting.
- Admin review console.
- Data ingestion pipeline.
- Entity resolution.
- Search indexing.
- Field-level source provenance.
- Suppression list.
- Rate limiting and anti-scraping controls.
- Ad integration with privacy-safe implementation.
- Privacy policy, terms, and FCRA prohibited-use disclosures.

### Out of Scope for MVP

- Paid reports.
- Criminal-record reports.
- Financial, credit, medical, insurance, or employment data.
- Public API.
- Bulk exports.
- Unlimited search access.
- User-generated comments or reviews.
- Scraped private social media.
- Breached or leaked datasets.
- Children's data.
- Sensitive-location data.
- Protected-class inference.

## 5. User-Facing Pages

### 5.1 Homepage

Requirements:

- Search mode tabs: `Name`, `Phone`, `Email`, `Address`.
- Mobile-first search form.
- Clear value proposition without implying guaranteed accuracy.
- Footer links:
  - Privacy Policy
  - Terms of Use
  - Opt Out
  - Do Not Sell or Share
  - FCRA Disclaimer
  - Contact
- No dark patterns around search or opt-out.

Acceptance criteria:

- User can choose a search mode.
- User can submit a valid search.
- Invalid input gets clear validation feedback.
- Legal/footer links are visible from the homepage.

### 5.2 Name Search

Inputs:

- First name.
- Last name.
- City optional.
- State optional.

Requirements:

- Normalize names for casing, spacing, punctuation, and common variants.
- Support partial location narrowing.
- Prevent empty or overly broad searches from returning unlimited records.
- Apply rate limits and bot checks.

Acceptance criteria:

- Search returns ranked possible matches.
- Search handles common spelling/casing variations.
- Search does not expose raw query data to ad or analytics vendors.

### 5.3 Reverse Phone Search

Inputs:

- US phone number.

Requirements:

- Normalize to E.164 format internally.
- Validate phone number format before searching.
- Match current and historical phone associations where allowed.
- Do not put the phone number in the URL, page title, analytics event name, or ad targeting data.

Acceptance criteria:

- User can search a valid US phone number.
- Invalid numbers are rejected with useful feedback.
- Matching profiles appear with uncertainty where appropriate.

### 5.4 Reverse Email Search

Inputs:

- Email address.

Requirements:

- Normalize email casing and surrounding whitespace before searching.
- Validate email format before creating a search token.
- Match current and historical email associations where allowed.
- Source adapters that expose public email fields must store them as email contacts with source provenance and must not infer emails from unrelated metadata.
- Do not put the email address in the URL, page title, analytics event name, or ad targeting data.

Acceptance criteria:

- User can search a valid email address.
- Invalid email addresses are rejected with useful feedback.
- Matching profiles appear with uncertainty where appropriate.

### 5.5 Reverse Address Search

Inputs:

- Street address (optional; partial input accepted).
- City optional.
- State optional.
- ZIP optional.

A search requires at least one of: a street, a ZIP, or a city together with a state.

Requirements:

- Normalize addresses with a reliable parser or address-normalization service.
- Support fuzzy address matching for partial street inputs and common street suffix variants such as `St`/`Street` and `Ave`/`Avenue`.
- Match on any meaningful subset of fields; street and state are not both required.
- Rank exact address matches above partial street-token matches, then by number of matched tokens.
- Exclude non-residential source-context locations (for example `arXiv, GLOBAL` or self-reported `User-entered` locations) from address results.
- Return possible residents, past residents, or property-associated people where allowed.
- Avoid exposing sensitive facilities, shelters, or protected addresses.
- Suppress exact address display where legal or safety review requires it.

Acceptance criteria:

- User can search a valid US address with any combination of street, city, state, or ZIP.
- City, state, and ZIP each narrow the fuzzy match when provided.
- Results distinguish current, historical, and uncertain associations.
- Suppressed addresses never appear publicly.

### 5.6 Search Results

Requirements:

- Show ranked possible matches.
- Default preview fields:
  - Name.
  - Approximate age or age range.
  - City and state.
  - Possible relatives or associates.
- Avoid showing exact street address in result cards unless explicitly approved after legal and safety review.
- Include a visible `Remove my info` link.
- Include a visible prohibited-use notice.
- Paginate results.
- Apply bot and scraping defenses.
- Cache computed result sets by a hashed, normalized query key with a configurable TTL.
- Do not cache raw search terms, and re-check suppression before displaying cached results.
- For name searches, check every built-in approved source adapter regardless of current local result count unless that source/query pair refreshed within the last hour.
- Track name-source freshness per source using a hashed, normalized query key; do not store raw names in source refresh logs.

Acceptance criteria:

- Results load quickly for common searches.
- Results show enough detail to choose a likely profile without exposing excessive data.
- Ad code does not receive PII through URLs or ad targeting keys.
- Repeated identical searches within the TTL use cached local result IDs instead of refreshing approved sources.
- Cache entries expire automatically and do not bypass opt-out or suppression controls.
- Repeated identical name searches refresh stale sources and skip only sources that are still inside the one-day source refresh TTL. A source is fetched for a query only when it has not been fetched in the last day (including a newly added source that has never been fetched for that query); already-fetched sources are not re-fetched repeatedly.

### 5.7 Profile Page

Potential public fields:

- Full name.
- Aliases or alternate names.
- Approximate age or age range.
- Current and past cities/states.
- Possible phone numbers.
- Possible email addresses.
- Possible relatives.
- Possible associates.
- Public-record category labels.

Internal-only fields:

- Source provenance.
- Confidence scores.
- Source import dates.
- Last verified dates.
- Suppression status.
- Entity-resolution debug data.

Requirements:

- Show clear uncertainty language such as `possible match` and `may be inaccurate`.
- Include `Is this you?` correction/removal entry point.
- Include `Report incorrect or harmful data`.
- Include FCRA prohibited-use notice.
- Require a user attestation before exposing more detailed profile data:
  - User must agree not to use the information for employment, tenant screening, credit, insurance, eligibility decisions, stalking, harassment, identity theft, or unlawful purposes.
- Do not include phone numbers, emails, or street addresses in page URLs, page titles, meta descriptions, analytics events, or ad targeting keys.

Acceptance criteria:

- Profile displays available public data.
- Profile can be removed through opt-out.
- Suppressed profiles are inaccessible publicly.
- Admins can inspect provenance for each field.

## 6. URL, SEO, Analytics, and Ad Safety

### 6.1 URL Requirements

Recommended URL patterns:

- Search results: `/search/results/{opaque_search_token}`
- Profile page: `/profile/{opaque_profile_id}`
- Opt-out page: `/opt-out`
- Privacy page: `/privacy`
- Terms page: `/terms`

Avoid:

- `/search?name=John+Smith&city=Seattle`
- `/phone/555-123-4567`
- `/address/123-main-st`
- `/john-smith-123-main-st`

Requirements:

- Search forms should submit by `POST`.
- Avoid PII in query strings.
- Avoid PII in path segments.
- Avoid PII in page titles and meta tags.
- Avoid PII in analytics event names, labels, or custom dimensions.
- Avoid PII in ad targeting keys.

Acceptance criteria:

- Browser URL never contains searched name, phone, email, or street address.
- Ad requests never include searched PII.
- Analytics events use generic event names and opaque identifiers only.

### 6.2 SEO Requirements

- Index homepage and informational pages.
- Index non-sensitive location/category pages only after review.
- Do not index opt-out confirmation pages.
- Do not index identity verification pages.
- Consider `noindex` for profile pages until legal, privacy, and ad-network review is complete.
- Generate XML sitemap only for approved public pages.
- Add robots.txt.
- Avoid doorway pages or low-value autogenerated pages.

Acceptance criteria:

- Public pages have correct canonical tags.
- Sensitive workflows use `noindex`.
- Sitemap excludes suppressed profiles and sensitive pages.

### 6.3 Ad Requirements

- Use display ads for monetization.
- Prefer contextual or non-personalized ads where possible.
- Use a consent management flow for applicable jurisdictions.
- Provide privacy disclosures for cookies, web beacons, IP addresses, identifiers, and third-party ad serving.
- Disable ads on:
  - Opt-out flow.
  - Identity verification pages.
  - Abuse report pages.
  - Admin pages.
  - Any page flagged safety-sensitive.
- Do not pass PII to Google AdSense or other ad networks.

Acceptance criteria:

- Ad integration passes privacy review.
- Ad code is absent from sensitive workflows.
- Ad requests do not include PII in URL, referrer, custom targeting, or analytics.

## 7. Data Requirements

### 7.1 Allowed Data Sources

- Licensed data providers with explicit permission for public people-search use.
- Public records where use is lawful and contractually allowed.
- Data directly submitted by the record subject.
- Correction/removal data submitted through internal workflows.

### 7.2 Prohibited Data Sources

- Breached, leaked, or stolen datasets.
- Private social media.
- Data scraped in violation of terms or law.
- Children's data.
- Medical or health data.
- Financial account data.
- Credit data.
- Precise location trails.
- Sensitive-location lists.
- Protected-class inference.
- Data from domestic violence shelters, protected facilities, or other safety-sensitive sources.

### 7.3 Public Records Source Matrix

Each public-record source must be approved per jurisdiction before ingestion. A record being publicly searchable does not automatically mean it can be collected, reused, republished, monetized with ads, or combined into a people-search profile.

| Source category | Typical records | Potential fields | Preferred acquisition method | MVP status | Notes and restrictions |
| --- | --- | --- | --- | --- | --- |
| County assessor, property tax, parcel, and GIS data | Parcel records, tax rolls, assessment records, address points, parcel boundaries | Owner name, mailing address, situs address, parcel ID, property type, sale date, assessed value | Official bulk CSV, open data portal, Socrata API, ArcGIS FeatureServer API, county data request | Candidate source | Use for name-address association and reverse address. Exact street address display requires legal/safety approval. Some counties charge for bulk data or impose license terms. |
| County recorder and land records | Deeds, mortgages, releases, liens, notices, document indexes | Grantor, grantee, recording date, document type, parcel number, mailing address | Official index export, bulk data subscription, records request, licensed vendor | Limited candidate | Prefer index metadata over full document scraping. Avoid broad display of foreclosure, lien, or debt-adjacent data in MVP. Redaction rules vary. |
| State Secretary of State business records | Business entities, registered agents, officers, UCC indexes | Entity name, officer names, registered agent, business address, filing status | Official bulk download, state API, paid state bulk subscription | Candidate source | Use mainly to disambiguate people and business affiliations. Do not treat business address as home address unless separately verified and approved. |
| Professional licensing boards and registries | Professional licenses, NPI records, state board license data | Name, credential, license status, practice address, business phone | Official API, official downloadable file, board bulk data request | Candidate source | Keep professional/business contact data separate from residential people-search data. Avoid implying endorsement, credential validity, or medical/financial facts beyond the official registry. |
| Federal SEC EDGAR and federal contractor/entity registries | Company filings, entity registrations, named officers/signers | Names, business roles, business addresses, filing metadata | Official SEC APIs, official government APIs, bulk datasets | Low-priority candidate | Useful for business-person disambiguation, not residential lookup. Avoid republishing full filings or irrelevant personal details. |
| Voter registration files | State voter file, registration status, voting history metadata in some states | Name, residential/mailing address, party, participation history depending on state | Official state purchase/download only after legal review | Exclude by default | Many states restrict access to political, election, governmental, or non-commercial uses. Do not scrape voter lookup portals. Use only if a specific state explicitly permits commercial public-lookup reuse and counsel approves. |
| Vital records indexes | Marriage, divorce, death, probate, archival indexes | Names, event dates, county, spouse name, deceased status | Official index download, archive dataset, county records request | Exclude from MVP | Birth records and minors are especially sensitive. Do not display exact birth dates. Death/probate data can be used only after legal and safety review. |
| Court records and case indexes | Federal PACER, state civil/criminal case indexes, bankruptcy dockets | Party names, case numbers, court, filing dates, docket metadata | Official PACER account/API where available, state bulk access, licensed legal-data vendor | Exclude from MVP | High FCRA, accuracy, reputational, and ad-policy risk. Do not scrape court portals. If ever used, keep off ad pages and require legal review. |
| Corrections, jail, arrest, and sex-offender registries | Inmate rosters, booking data, registry data | Name, photo, offense, status, address in some registries | Official API/bulk access only | Prohibited for MVP | High harm and misuse risk. Many registries include strict usage warnings. Do not monetize with ads or combine into general people profiles without separate legal/product review. |
| Unclaimed property | State treasurer unclaimed property listings | Name, last known city/state/address, property type | Official bulk license or state data request | Exclude by default | Many state search sites are intended for claimant lookup, not commercial republication. Do not scrape search portals unless explicitly authorized. |
| DMV, driver, vehicle registration, and motor vehicle records | Driver records, vehicle title/registration records | Name, address, license data, vehicle details | Not allowed for this product | Prohibited | Driver's Privacy Protection Act and state laws restrict disclosure and use. Exclude unless a specific permitted purpose exists, which this product does not have. |

### 7.4 Source Approval Checklist

Before building an adapter for any source:

- Identify the official data owner.
- Record the exact source URL, API documentation, download page, contract, license, or records-request response.
- Confirm commercial reuse and republication are allowed.
- Confirm automated access is allowed.
- Confirm ad-supported republication is allowed.
- Confirm whether derived data can be combined with other sources.
- Confirm required attribution, update frequency, deletion rules, and redistribution limits.
- Check for protected-address programs, redaction requirements, and suppressed records.
- Check whether the source includes minors, crime victims, protected persons, sealed records, or sensitive facilities.
- Get legal approval for the source category and jurisdiction.
- Add the source to the internal `approved_sources` registry before ingestion.

Acceptance criteria:

- No adapter runs against an unapproved source.
- Every approved source has a saved license/terms snapshot or contract reference.
- Every source has an owner, update cadence, and allowed-field map.

### 7.5 Collection and Scraping Policy

Use this acquisition priority order:

1. Official bulk download or purchased bulk file from the agency.
2. Official API or open data endpoint.
3. Official records request for a machine-readable export.
4. Licensed third-party provider with explicit people-search/public-display rights.
5. HTML collection only when the source terms allow automated access and no bulk/API path exists.

Approved collection patterns:

- Download official CSV, TSV, JSON, XML, GeoJSON, Shapefile, or Parquet exports.
- Use official Socrata/SODA APIs for open data portals.
- Use official ArcGIS REST FeatureServer endpoints for GIS parcel/address datasets.
- Use official SEC, CMS/NPI, state, county, or municipal APIs.
- Use official paid bulk subscriptions where allowed.
- Use records-request exports when an agency does not publish direct downloads.
- Use HTML table parsing only for approved pages with stable public tables and allowed automated access.

Disallowed collection patterns:

- Bypassing CAPTCHA, login controls, paywalls, session controls, IP blocks, or anti-bot protections.
- Using rotating residential proxies to evade limits.
- Reverse engineering private browser APIs when a public API, export, or license is unavailable.
- Continuing to crawl after a cease-and-desist, block, or explicit denial.
- Scraping voter lookup portals, court portals, DMV portals, or claimant lookup portals unless written permission or official documentation explicitly allows automated bulk access.
- Collecting documents or fields that the source marks as redacted, sealed, confidential, restricted, or safety-sensitive.
- Collecting data for a purpose that conflicts with the source terms or statutory limits.

### 7.6 Scraper Adapter Requirements

Each source adapter must implement:

- `source_id`.
- Source type.
- Jurisdiction.
- License/terms reference.
- Collection method: `bulk_file`, `official_api`, `records_request`, `licensed_vendor`, or `approved_html`.
- Allowed fields.
- Prohibited fields.
- Update cadence.
- Rate limit.
- Contact/user-agent string where applicable.
- Retry policy with backoff.
- Checkpoint/resume support.
- Raw-record storage.
- Parser version.
- Source record hash.
- Import batch ID.
- Field-level provenance mapping.
- Suppression enforcement before publish/index.

Operational requirements:

- Prefer incremental imports where the source exposes `updated_at`, recording date, filing date, or equivalent.
- Use `ETag`, `Last-Modified`, checksums, source timestamps, or file manifests when available.
- Keep raw source payloads in restricted storage with retention limits.
- Parse into normalized staging tables before entity resolution.
- Validate row counts and schema changes on every import.
- Quarantine records with unexpected schema, malformed names, malformed addresses, or missing provenance.
- Run safety filters before any record reaches the public index.

### 7.7 Source-Specific Implementation Notes

#### Property and Parcel Open Data

Preferred method:

- Use official county open data exports, Socrata APIs, ArcGIS REST APIs, or county-provided GIS downloads.

Implementation notes:

- For Socrata datasets, store the dataset identifier, use API pagination, request only approved columns, and prefer updated timestamps for incremental syncs.
- For ArcGIS FeatureServer datasets, use the official REST query endpoint, respect `maxRecordCount`, page with result offsets or object IDs, and request only approved fields.
- Normalize parcel addresses separately from owner mailing addresses.
- Treat `owner mailing address` as potentially different from `property address`.
- Do not assume owner occupancy without additional evidence.

MVP display rule:

- Use city/state-level address associations first.
- Exact street address display stays behind legal/safety review.

#### Recorder and Land Records

Preferred method:

- Use official recorder index exports, paid county bulk subscriptions, or records-request exports.

Implementation notes:

- Ingest index metadata before considering document images or PDFs.
- Avoid OCR of full documents unless legal approves the exact field extraction.
- Do not display sensitive debt, foreclosure, lien, or family-law-adjacent data in MVP.
- Store document numbers and recording dates for provenance.

MVP display rule:

- Use only for confidence scoring or source evidence unless explicitly approved for public display.

#### Business Entity Records

Preferred method:

- Use official Secretary of State APIs, bulk order files, or daily change files.

Implementation notes:

- Keep business entities separate from person profiles.
- Link a person to a business role only when the source has a clear officer, organizer, or registered-agent field.
- Mark all business addresses as business/filing addresses unless separately verified.

MVP display rule:

- Display only business affiliation summaries if approved.

#### Professional Licenses and NPI

Preferred method:

- Use official board downloads, CMS NPPES downloadable files, or CMS NPI Registry API.

Implementation notes:

- Store credentials and practice addresses as professional data.
- Do not mix patient, health, insurance, or claims data into this product.
- Do not represent license status unless the source supplies it and the import is current.

MVP display rule:

- Optional; keep professional listings visually separate from residential/contact data.

#### Voter Files

Preferred method:

- None for MVP.

Implementation notes:

- Do not scrape voter registration lookup pages.
- State voter file access rules vary widely.
- Some states limit data to campaigns, parties, researchers, governmental purposes, or non-commercial use.
- If a state explicitly allows commercial reuse, require source-specific legal approval before ingestion.

MVP display rule:

- Excluded.

#### Court Records

Preferred method:

- None for MVP.

Implementation notes:

- PACER provides public access to federal court records for registered users, but court data creates significant FCRA, accuracy, and reputational risk in a people-search product.
- Do not scrape court portals.
- Do not summarize, infer, or display criminal/civil case data without separate legal review.

MVP display rule:

- Excluded.

#### Vital Records

Preferred method:

- None for MVP.

Implementation notes:

- Vital records are generally created and controlled by local/state authorities, and access varies.
- Do not collect birth-certificate data, minor data, or exact date-of-birth data for public display.
- Marriage, divorce, probate, and death indexes require jurisdiction-specific review.

MVP display rule:

- Excluded except possible deceased-status suppression after legal approval.

### 7.8 Field-Level Provenance

Every data field must track:

- Source name or source category.
- Source record ID if available.
- Import timestamp.
- Last verified timestamp if available.
- Confidence score.
- Display eligibility.
- Suppression status.
- License or usage constraints.

Acceptance criteria:

- Admin can inspect where every displayed field came from.
- Data with missing provenance is not displayed publicly.

## 8. Entity Resolution

Requirements:

- Normalize names, addresses, phone numbers, and emails.
- Group records into likely person entities.
- Maintain confidence scores for merges.
- Support manual merge/split in admin.
- Avoid over-merging people with similar names.
- Preserve source records separately from resolved profiles.

Acceptance criteria:

- Profiles can be traced back to source records.
- Admin can split incorrectly merged profiles.
- Low-confidence associations are marked as possible or hidden.

## 9. Opt-Out, Correction, and Data Rights

### 9.1 Opt-Out Flow

Requirements:

- Public opt-out page.
- User can find their profile and request removal.
- No account required.
- Verify request using risk-appropriate identity verification.
- Remove/suppress public profile after approval.
- Add identifiers to suppression list.
- Prevent removed profiles from reappearing after future imports.
- Send status emails where email is provided.

Acceptance criteria:

- User can complete opt-out without creating an account.
- Suppression survives re-ingestion.
- Admin can audit request history.

### 9.2 Correction and Dispute Flow

Requirements:

- Users can report inaccurate data.
- Admin can review field-level source evidence.
- Admin can remove, correct, or mark disputed fields.
- Keep audit trail.

Acceptance criteria:

- Incorrect data can be suppressed or corrected.
- Public profile updates after admin approval.

### 9.3 State Privacy Rights

Requirements:

- Support `Do Not Sell or Share` requests.
- Support deletion requests where required.
- Support access/correction requests where required.
- Track deadlines and status.
- Prepare for state data broker obligations.
- California Delete Act readiness:
  - Beginning August 1, 2026, covered data brokers must access California DROP at least every 45 days and process deletion requests, subject to exceptions.

Acceptance criteria:

- State privacy requests are tracked separately from ordinary opt-outs.
- Legal deadlines are visible in admin.

## 10. Abuse Prevention

Requirements:

- Rate limit by IP.
- Rate limit by session.
- Rate limit by account if accounts are introduced.
- Use device/browser risk signals where lawful.
- Add CAPTCHA or challenge after suspicious behavior.
- Block bulk enumeration.
- Detect repeated lookups of the same person, phone, or address.
- Detect high-volume sequential searches.
- Detect searches for protected addresses or safety-sensitive locations.
- Provide emergency removal path.
- Maintain denylist for abusive IPs, ASNs, users, and patterns.

Acceptance criteria:

- Automated scripts cannot scrape profiles at scale.
- Suspicious traffic triggers challenge or block.
- Admin can review abuse events.

## 11. Legal and Policy Requirements

Required notices:

- Not a consumer reporting agency.
- Not a consumer report.
- May not be used for FCRA-regulated decisions.
- May not be used for employment, tenant screening, credit, insurance, or eligibility decisions.
- May not be used for stalking, harassment, identity theft, intimidation, or unlawful activity.
- Data may be inaccurate, incomplete, or outdated.

Required documents:

- Terms of Use.
- Privacy Policy.
- FCRA Disclaimer.
- Do Not Sell or Share page.
- Opt-Out instructions.
- Contact page.

Acceptance criteria:

- Legal notices appear in footer, results, profile pages, and detailed-data attestation.
- Terms require user agreement before detailed profile display.
- Legal review is completed before public launch.

## 12. Security Requirements

Requirements:

- TLS everywhere.
- Encryption at rest for sensitive fields.
- Secrets manager.
- Role-based access control.
- MFA for admins.
- Audit logs for admin actions.
- Audit logs for privacy requests.
- Principle of least privilege for database and infrastructure access.
- Regular dependency scanning.
- Regular vulnerability scanning.
- Incident response plan.
- Backups and restore testing.

Acceptance criteria:

- Admin access requires MFA.
- Privacy and admin actions are auditable.
- Sensitive configuration is not stored in source control.

## 13. Admin Console Requirements

Admin capabilities:

- Search profiles.
- View source records.
- View field-level provenance.
- Merge profiles.
- Split profiles.
- Suppress profile.
- Suppress individual fields.
- Review opt-out requests.
- Review correction requests.
- Review abuse reports.
- View rate-limit events.
- Manage denylist.
- Export compliance logs.

Acceptance criteria:

- Admin can resolve a removal request end to end.
- Admin can identify every public field's source.
- Admin actions are logged with actor, timestamp, before, and after.

## 14. Technical Architecture

Recommended stack:

- Frontend: Next.js.
- Backend API: Node/NestJS or Python/FastAPI.
- Database: PostgreSQL.
- Search: OpenSearch or Elasticsearch.
- Queue: Redis/BullMQ, SQS, or equivalent.
- Object storage: S3-compatible storage.
- Auth: managed auth or hardened internal auth.
- Analytics: privacy-conscious analytics with no PII.
- Ads: AdSense or comparable ad network.
- Hosting: cloud provider with CDN/WAF.

Core services:

- Public web app.
- Search API.
- Profile API.
- Opt-out API.
- Admin API.
- Ingestion worker.
- Entity-resolution worker.
- Search-index worker.
- Suppression service.
- Abuse/risk service.

## 15. Data Model Draft

Core tables:

- `source_records`
- `profiles`
- `profile_fields`
- `profile_sources`
- `addresses`
- `phones`
- `emails`
- `relationships`
- `search_events`
- `abuse_events`
- `suppression_entries`
- `privacy_requests`
- `correction_requests`
- `admin_audit_logs`
- `source_imports`

Key design rule:

- Raw source records and resolved public profiles must be stored separately.

## 16. Implementation Milestones

### Milestone 0: Foundation

- [ ] Confirm legal/compliance strategy.
- [ ] Choose company/entity and operating jurisdictions.
- [ ] Select initial data sources.
- [ ] Decide MVP geography.
- [ ] Choose tech stack.
- [ ] Create initial repo structure.

### Milestone 1: Product Skeleton

- [ ] Build homepage.
- [ ] Build search mode forms.
- [ ] Build static legal/disclosure pages.
- [ ] Add basic layout and responsive styling.
- [ ] Add privacy-safe routing.

### Milestone 2: Data Ingestion

- [ ] Define source import format.
- [ ] Build ingestion pipeline.
- [ ] Normalize names.
- [ ] Normalize phone numbers.
- [ ] Normalize addresses.
- [ ] Store field provenance.
- [ ] Enforce suppression before display/indexing.

### Milestone 3: Search

- [ ] Create search index schema.
- [ ] Implement name search.
- [ ] Implement reverse phone search.
- [x] Implement reverse address search.
- [ ] Add ranked matching.
- [ ] Add pagination.
- [ ] Add rate limiting.

### Milestone 4: Profiles

- [ ] Build profile API.
- [ ] Build profile page UI.
- [ ] Add user attestation for detailed data.
- [ ] Add profile-level opt-out link.
- [ ] Add incorrect-data reporting.
- [ ] Add public uncertainty labels.

### Milestone 5: Privacy Workflows

- [ ] Build opt-out form.
- [ ] Build identity verification flow.
- [ ] Build suppression list.
- [ ] Build correction request flow.
- [ ] Build request status tracking.
- [ ] Build email notifications.
- [ ] Verify suppression survives re-import.

### Milestone 6: Admin Console

- [ ] Build admin authentication.
- [ ] Enforce MFA.
- [ ] Build privacy request queue.
- [ ] Build profile/source inspector.
- [ ] Build merge/split tools.
- [ ] Build suppression controls.
- [ ] Build abuse event dashboard.
- [ ] Build audit log viewer.

### Milestone 7: Ads and Analytics

- [ ] Add consent management.
- [ ] Add ad slots to approved pages.
- [ ] Keep ad code off sensitive workflows.
- [ ] Ensure ad requests contain no PII.
- [ ] Add privacy-safe analytics.
- [ ] Verify search queries are not sent to analytics or ad vendors.

### Milestone 8: Security and Launch Readiness

- [ ] Security review.
- [ ] Legal review.
- [ ] Privacy review.
- [ ] Ad-network policy review.
- [ ] Load testing.
- [ ] Abuse testing.
- [ ] Backup/restore test.
- [ ] Incident response checklist.
- [ ] Limited beta launch.
- [ ] Public launch.

## 17. Open Decisions

- Which data providers will be used?
- Which states/geographies are included in MVP?
- Will profile pages be indexed by search engines?
- Will exact street addresses be shown publicly?
- Which ad network will be used first?
- Will users need accounts for repeated detailed lookups?
- What identity verification vendor or process will be used for opt-out?
- What SLA will be promised for opt-out and correction requests?
- What data retention periods will be used for raw source files and logs?
- Which public-record source categories will be approved for MVP?
- Which jurisdictions will have source-specific legal review first?
- Will exact property owner mailing addresses ever be displayed publicly?
- Will business/professional records be shown on person profiles or separated into a business/professional search experience?
- Will any source require paid bulk data subscriptions or public-records requests?

## 18. External References

- FTC people-search consumer guidance: https://consumer.ftc.gov/articles/what-know-about-people-search-sites-sell-your-information
- FTC Fair Credit Reporting Act overview: https://www.ftc.gov/legal-library/browse/statutes/fair-credit-reporting-act
- FTC tenant/background-screening FCRA guidance: https://www.ftc.gov/business-guidance/resources/what-tenant-background-screening-companies-need-know-about-fair-credit-reporting-act
- California CPPA Data Broker Registry: https://cppa.ca.gov/data_brokers/
- Google AdSense Publisher Policies: https://support.google.com/adsense/answer/10502938
- Google AdSense guidance on avoiding PII in ad requests: https://support.google.com/adsense/answer/6156630
- USAGov local government directory: https://www.usa.gov/local-governments
- PACER federal court records: https://pacer.uscourts.gov/
- PACER case locator overview: https://pacer.uscourts.gov/find-case
- National Archives vital records overview: https://www.archives.gov/research/vital-records
- NASS voter registration information FAQ: https://www.nass.org/sites/default/files/Election%20Cybersecurity/NASS-briefing-FAQ-info-security-2022_8.25.22.pdf
- U.S. Election Assistance Commission voter list resources: https://www.eac.gov/election-officials/voter-lists-registration-confidentiality-and-voter-list-maintenance
- Driver's Privacy Protection Act, 18 U.S.C. 2721: https://www.law.cornell.edu/uscode/text/18/2721
- CMS NPI Registry: https://npiregistry.cms.hhs.gov/
- CMS NPI Registry API: https://npiregistry.cms.hhs.gov/api-page
- CMS NPPES downloadable files: https://download.cms.gov/nppes/NPI_Files.html
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Socrata developer API: https://dev.socrata.com/
- Cook County open data programmatic access example: https://datacatalog.cookcountyil.gov/stories/s/Programmatic-Access/xydy-d85m/
- California Secretary of State business entity bulk records: https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records
- Kentucky Secretary of State bulk data service example: https://sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx
