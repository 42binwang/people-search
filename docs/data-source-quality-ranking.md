# Data Source Quality Ranking

Last updated: 2026-06-21

A residential-weighted quality ranking of every people/profile data source — implemented, configured, and pending (the Potential Source Tracker in [`data-sources.md`](./data-sources.md)). Re-run this assessment when sources are added, licensed, or blocked. Companion to the tracker (which tracks *implementation status*); this doc ranks *data quality and product fit*.

## Methodology

Each source is scored 1–5 on seven dimensions, then combined into a 0–100 composite:

- **R** Residential relevance (double-weighted) — 5 = ties a real person's name to a current residential street address; 3 = name + business/practice/mailing address; 1 = no address (catalog/identity-only).
- **C** Coverage breadth (1.5×) — population scale.
- **F** Field richness — name + address + phone + email + DOB/age + relatives + history.
- **U** Freshness/currency — official update cadence.
- **A** Authority/accuracy — official record of fact vs catalog vs user-entered.
- **L** Legal/reuse clarity — open license / commercial display allowed.
- **S** Accessibility/cost — free bulk/API now vs paid/contract/records-request.

Composite = `round((2·R + 1.5·C + F + A + U + L + S) / 8.5 · 20)`. Residential relevance is double-weighted and coverage 1.5× because this product is a people/address lookup. Tiering prioritizes the product's actual mission (tying real names to real residential addresses) **and** deployability over raw composite, so an access-blocked high-R source can still be Tier 1 by data fit, while a clean-license R=1 source falls to Tier 3.

## Ranked master table

| Source | Cluster | Status | R | C | F | U | A | L | S | Composite | Takeaway |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CMS NPPES NPI Registry | Professional-licensing | Implemented | 3 | 5 | 4 | 5 | 5 | 5 | 5 | 86 | Best-in-class: free, public-domain, ~7M providers tied to a verifiable street+phone; business not residential address |
| FEC Schedule A individual contributions | Public-records / Government | P1 in-progress | 4 | 5 | 4 | 5 | 4 | 3 | 5 | 86 | Free national API of named donors + street address; self-reported, political context, 30107(b)(4) solicitation limit |
| ClinicalTrials.gov | Social / identity-context | Implemented | 2 | 5 | 3 | 5 | 5 | 5 | 5 | 79 (adj −2) | Excellent access/authority/license but facility/practice addresses, not residences; identity context only |
| Official Open Parcel/Tax Sources (ArcGIS/Socrata) | PROPERTY/PARCEL | ready-local | 4 | 4 | 3 | 4 | 5 | 3 | 4 | 78 | Highest-authority owner-name-to-situs-address link; ready locally (WI, FL, VT statewide plus county configs), national patchwork |
| Harris Central Appraisal District property data | PROPERTY/PARCEL | Implemented | 4 | 3 | 3 | 4 | 5 | 4 | 4 | 76 | Official Harris County appraisal bulk text files; owner name plus situs/mailing address and optional personal-property account phone, but local-file ingest and protected-address review are required before public display |
| State voter registration files | Public-records / Government | P3 blocked/legal-review | 5 | 5 | 3 | 4 | 5 | 1 | 2 | 76 | Peak raw residential value (name+address, tens of millions) but commercial-use bans block it in key states |
| Consumer marketing address feeds (USPS/NCOA/credit-header) | Consumer / licensed residential | deprioritized | 5 | 5 | 5 | 5 | 3 | 1 | 1 | 76 | Highest data value of the set but GLBA/FCRA/CFPB-gated; incompatible with ad-supported public product |
| IRS Form 990 officers | Public-records / Government | ready-local | 2 | 4 | 4 | 4 | 5 | 5 | 3 | 71 | Official e-filed nonprofit officer/director records with organization business address; single XML and TEOS monthly ZIP ingest are supported, but it is not a live lookup and not residential evidence |
| State Professional Licensing Boards | Professional-licensing | P1 candidate | 3 | 3 | 4 | 4 | 5 | 3 | 2 | 66 | Official name+license+practice address per board; fragmented 50-state, fee/PRA-only, business address |
| PubMed | Academic/catalog/identity-context | Implemented | 1 | 5 | 3 | 5 | 5 | 5 | 4 | 66 (adj −8) | Public-domain, structured corresponding-author email; no address, institutional only |
| Licensed California Property Feed (e.g. ParcelQuest) | PROPERTY/PARCEL | candidate | 4 | 5 | 3 | 4 | 4 | 1 | 1 | 65 | Only path to all-CA owner+address (incl. all 9 Bay Area counties); contract forbids redistribution |
| OpenAlex authors | Academic/catalog/identity-context | Implemented | 1 | 5 | 3 | 5 | 3 | 5 | 5 | 64 (adj −8) | CC0, ~hundreds of millions of authors; institution is not a residence |
| Crossref works | Academic/catalog/identity-context | Implemented | 1 | 5 | 2 | 5 | 4 | 5 | 5 | 64 (adj −8) | 150M+ works, free reuse; author-name-on-paper only, no person/address fields |
| Federal Register documents | Public-records / Government | Implemented | 1 | 4 | 2 | 5 | 5 | 5 | 5 | 63 (adj −8) | Free public-domain daily provenance; no person/address fields, not residential |
| ORCID public registry | Academic/catalog/identity-context | Implemented | 1 | 4 | 4 | 5 | 4 | 5 | 4 | 63 (adj −8) | Richest identity fields incl. public email; affiliations are employer not residence |
| State Secretary of State Business Entity Registrations | Business-entity | P1 candidate | 2 | 4 | 4 | 4 | 5 | 3 | 2 | 60 | Official officer/agent+business address; not a residence, fragmented, license-gated bulk |
| DataCite DOIs | Academic/catalog/identity-context | Implemented | 1 | 4 | 2 | 5 | 4 | 5 | 5 | 60 (adj −8) | 50M+ DOIs, free reuse; creator-name catalog metadata only |
| Library of Congress | Academic/catalog/identity-context | Implemented | 1 | 4 | 2 | 4 | 5 | 5 | 4 | 60 (adj −6) | High-authority national library catalog; titles, not persons |
| County Recorder Deed Index (Grantor/Grantee) | DEED | candidate | 3 | 3 | 3 | 4 | 5 | 3 | 1 | 59 | Official ownership history; bulk needs records-request or paid aggregator, address often mailing |
| Europe PMC | Academic/catalog/identity-context | Implemented | 1 | 5 | 2 | 5 | 4 | 4 | 4 | 59 (adj −8) | 46M+ records; author metadata only, mixed per-article licenses |
| Wikidata entities | Academic/catalog/identity-context | Implemented | 1 | 5 | 3 | 5 | 2 | 5 | 3 | 59 (adj −6) | CC0, 110M+ items for notable entities; community-edited, SPARQL rate-limited, not residential |
| arXiv | Academic/catalog/identity-context | Implemented | 1 | 4 | 2 | 5 | 4 | 3 | 4 | 57 (adj −4) | Preprint author metadata; no location, per-article license terms |
| MusicBrainz | Academic/catalog/identity-context | Implemented | 1 | 4 | 2 | 5 | 2 | 5 | 4 | 57 (adj −4) | CC0 music encyclopedia; narrow population, not residential |
| Local Person-Bearing Building Permits (Socrata/ArcGIS) | PERMIT | candidate | 2 | 3 | 3 | 4 | 4 | 3 | 3 | 56 | Free city open-data name+permit-address; often LLC/contractor, not a residence |
| OpenFEC candidates | Public-records / Government | Implemented | 1 | 3 | 2 | 4 | 4 | 5 | 5 | 56 (adj −6) | Clean public-domain API; federal candidates only, no address |
| VIAF | Academic/catalog/identity-context | Implemented | 1 | 5 | 1 | 3 | 4 | 4 | 4 | 56 (adj −4) | LOD name-authority clusters; lowest field richness, no address |
| GitHub users | Social / identity-context | Implemented | 1 | 5 | 2 | 4 | 3 | 4 | 3 | 56 (adj −4) | Free API, millions of devs; user-entered free-text location, not residential |
| Open Library | Academic/catalog/identity-context | Implemented | 1 | 4 | 2 | 4 | 2 | 5 | 4 | 55 (adj −4) | CC0 ~6M authors; book-catalog titles, not persons |
| Semantic Scholar authors | Academic/catalog/identity-context | Implemented | 1 | 5 | 3 | 4 | 2 | 3 | 3 | 54 (adj −4) | Large author graph; aggregator-derived, rate-limited, no address |
| Stack Exchange users | Social / identity-context | Implemented | 1 | 5 | 1 | 4 | 3 | 4 | 4 | 54 (adj −4) | Free CC BY-SA API; display name only, zero residential value |
| Google Books | Academic/catalog/identity-context | Implemented | 1 | 5 | 1 | 5 | 2 | 2 | 4 | 51 (adj −4) | Large book metadata; lowest richness, Google ToS restricts reuse |
| County/state civil, probate, and lien indexes | Public-records / Government | P3 blocked/legal-review | 2 | 4 | 3 | 2 | 4 | 1 | 1 | 49 | Stale, high-harm, FCRA-sensitive; records-request only, blocked |
| Internet Archive | Academic/catalog/identity-context | Implemented | 1 | 4 | 2 | 4 | 2 | 2 | 3 | 49 | Large archive of creators; user-contributed, mixed license, post-Hachette posture |
| Obituary / probate / death index (SSDI-style) | Consumer / social | deprioritized | 2 | 2 | 3 | 2 | 3 | 2 | 2 | 45 | Patchy, post-2014 gated by NTIS certification; deceased-profile risk |
| Incogni broker coverage list | Broker-reference / opt-out | blocked/reference | 1 | 3 | 1 | 3 | 3 | 1 | 2 | 39 | Broker directory with no profile fields; useful only for opt-out/suppression planning and provider research, not ingestion |

"(adj −N)" = a residential-relevance calibration penalty (see Calibration notes).

## Tier summary

**Tier 1 — Top residential-data quality, usable now or near-term** (Composite ≥ 78, R ≥ 2 AND a genuine name-to-address link):
1. **CMS NPPES NPI Registry (86)** and **FEC Schedule A (86)** — both implemented/in-progress, free, public-domain, national, with named individuals tied to a verifiable street location. NPPES ties providers to practice/phone; FEC ties donors to a contributor street address. Deployable today; caveat: addresses are business/contribution (not proven residence), hence R=3–4 not 5.
2. **Official Open Parcel/Tax Sources (78, R=4)** — the strongest true residential-ownership link in the set (assessor situs + owner name), already ready-local with WI, FL, VT statewide plus county configs. Tier 1 despite national patchwork because it is authoritative, license-clear, and on-path.
3. **ClinicalTrials.gov (79, R=2 after adj)** — top-3 by composite on access/authority/license quality alone; demoted within the tier because its addresses are facility/practice (identity context, low people-search value).

**Tier 2 — Useful context / secondary** (Composite 56–71): IRS Form 990 officers (71), State Professional Licensing Boards (66), Licensed California Property Feed (65), PubMed/OpenAlex/Crossref/Federal Register/ORCID (60–66 after adj), SoS Business Entity (60), DataCite/Library of Congress (60), County Recorder Deed (59), Europe PMC/Wikidata (59). Sources that either carry a real name-to-address link but are access/license-blocked (CA property feed contract-locked; licensing boards/deed fee/PRA-gated) or are high-quality free identity/context sources that aid disambiguation but have no residential value.

**Tier 3 — Low residential value or blocked** (Composite ≤ 56): everything R=1 in the academic/social catalog band with no address (arXiv, MusicBrainz, VIAF, Open Library, Semantic Scholar, Stack Exchange, GitHub, Google Books, Internet Archive), plus context-light OpenFEC candidates (56), Local Person-Bearing Permits (56), and the Incogni broker coverage list (39), which is an opt-out planning reference rather than a person/profile source. Two important exceptions score in the upper-60s but are Tier 3 for product fit: **State voter registration (76, R=5)** and **Consumer marketing address feeds (76, R=5)** are the single highest-quality residential datasets but are hard-blocked by state commercial-use bans (voters) and GLBA/FCRA/CFPB rules (consumer feeds) — parked, not usable.

## Top residential picks

For tying a real person's name to a real residential address, ranked by fit + deployability:

1. **Official Open Parcel/Tax Sources (ArcGIS/Socrata)** — the only currently-deployable source where a government assessor directly records an owner name against a situs property address. Status ready-local, license-clear, high authority. Best real-world anchor for "who lives/owns where." Caveat: situs is a property address (mailing-vs-site ambiguity), coverage is a county/state patchwork, and protected-address suppression is an operator obligation. **#1 residential pick.**
2. **FEC Schedule A individual contributions** — free, public-domain, national API; contributor name + street address (when itemized) for tens of millions; adapter/loader/tests already exist. Strongest breadth of any currently-buildable residential-ish source. Caveats: self-reported, often city/ZIP-only for sub-itemized records, politically sensitive, and 52 USC 30107(b)(4) bars commercial solicitation (display policy needs sign-off). Corroborating residence, not proof.
3. **State voter registration files** — objectively the best residential dataset (government-maintained name + registration address, tens of millions, R=5). Blocked: many states (CA, NY, PA) prohibit commercial/non-election use and resale; access is paid/records-request per state; status P3 legal-review. Unblocks only state-by-state with counsel approval.
4. **CMS NPPES NPI Registry** — free, public-domain, real-time national directory tying ~7M named providers to a verifiable street + phone. Deployable now. Limitation: practice/mailing addresses are business locations, so residential-relevant only for the professional subset (R=3) — strong corroborating signal, not a general-population residence resolver.
5. **Licensed California Property Feed (ParcelQuest)** — only realistic path to owner-name + address for all of California incl. the 9 Bay Area counties where official sources suppress owner names. Blocked for this product: license prohibits redistribution/resale and retains exclusive commercial rights; needs a bespoke negotiated contract (unsigned). If a compliant contract is struck, it jumps to #1.

## Calibration notes

All five clusters used the shared rubric, but the Academic/catalog cluster (15 sources) systematically inflated composites via high Coverage/Freshness/License/Authority scores, producing R=1 sources at 65–74. Because R is double-weighted and is the product's primary axis, an R=1 source with zero address value should not outrank an R=3–4 source with a real name-to-address link. A small, rule-based R-aware penalty was applied to context-only sources: R=1 with composite ≥ 67 got −8; 62–66 got −6; 55–61 got −4. No source moved below 45. Residential-relevant sources (R ≥ 3) and access-blocked residential sources kept their agent-assigned composites (their R already reflects residential value; their L/S already reflects blockage).

Specifically calibrated: PubMed 74→66, OpenAlex 72→64, Crossref 72→64, Federal Register 71→63, ORCID 71→63, DataCite 68→60, Europe PMC 67→59, Library of Congress 66→60, Wikidata 65→59, arXiv 61→57, MusicBrainz 61→57, Open Library 59→55, Semantic Scholar 58→54, Google Books 55→51, OpenFEC candidates 62→56, VIAF 60→56, GitHub 60→56, Stack Exchange 58→54. ClinicalTrials.gov (R=2, 81) got a light −2 so it no longer outranks the genuine residential-link source Official Open Parcel (78).

Two structurally important caveats are preserved rather than numerically penalized: State voter registration (76) and Consumer marketing address feeds (76) keep high composites because the rubric already scored their L=1 and S=1–2, correctly flagging them as blocked — **tiering** (not composite) is what relegates them to Tier 3 for this ad-supported public product.
