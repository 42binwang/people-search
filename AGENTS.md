# Coding Agent Guide

Last updated: 2026-06-21

This file is for every coding agent working in this repository. Read it before changing code, docs, configs, tests, or ingestion behavior.

## Product Boundary

Search People is an AI-assisted public lookup site backed by approved public, official, or licensed data sources. The product is free to users and monetized with privacy-safe display ads.

The site is not a consumer reporting agency and must not be built for employment, tenant screening, credit, insurance, eligibility, stalking, harassment, identity theft, or other prohibited uses. Do not add features, copy, URLs, data displays, exports, or APIs that weaken that boundary.

## Non-Negotiables

- Use only approved public, official, records-request, or licensed data sources.
- Do not scrape arbitrary people-search brokers, private social media, breached/leaked datasets, or sources whose terms disallow automated access, commercial use, caching, or republication.
- HTML scraping is allowed only when automated access and reuse are explicitly permitted and documented.
- Keep source provenance for every imported profile field.
- Do not put names, phones, emails, street addresses, or raw search terms in URLs, page titles, analytics names, ad-targeting keys, logs, or cache keys.
- Treat opt-out, suppression, correction, abuse reporting, rate limiting, and FCRA notices as core product behavior.
- Aggregate sources such as Census, IRS SOI, HUD, and BLS must stay aggregate. Never join them to individual profiles to infer a person's residence, income, employment, race, household, movement, or eligibility.
- Source-context locations such as `arXiv, GLOBAL`, `Internet Archive, GLOBAL`, `GitHub, GLOBAL`, and generic `US` metadata are not residential locations.
- Exact street addresses should appear only where the source is approved for display, the data is not protected/sensitive, and the UI uses uncertainty language.
- If an approved source exposes public emails, store them only as sourced email contacts. Do not infer email addresses from names, usernames, domains, affiliations, catalog text, or publication metadata.

## Source Approval Workflow

Before adding or enabling a source:

1. Confirm the source is official/public-domain, public-record with permitted reuse, a records-request export, or a licensed provider.
2. Record source URL, terms URL, coverage, refresh cadence, fields imported, protected-address handling, and review date in config or docs.
3. Prefer official APIs or bulk files. Use HTML only with explicit permission.
4. Add a focused adapter test. Each source adapter should have at least one unit test covering mapping and failure behavior.
5. Add or update the source inventory in `docs/data-sources.md`.
6. If the work touches a future/pending source, update the `Potential Source Tracker` in `docs/data-sources.md` in the same change. Track adapter, loader/CLI, config, tests, docs, approval, display policy, and the next step.
7. If the source can expose street addresses, add suppression/protected-address notes and verify opt-out still applies before display.

**Always update the data source table when an adapter is finished.** Whenever you finish building (or substantially change) an adapter for a source, update `docs/data-sources.md` in the same change: add or update its row in the *Existing Person/Profile Sources*, *Existing Configurable Person/Property Adapters*, or *Approved Property Sources Currently Configured* table, and flip the adapter/loader/config/tests checkboxes (`[x]` done, `[~]` partial, `[ ]` not started) in the matching *Potential Source Tracker* entry. Never leave a finished adapter untracked or still marked as pending.

**This is enforced, not just requested.** `npm run sources:validate-inventory` (part of `npm run presubmit`) discovers every adapter in `lib/sources/` that declares a `sourceId` and fails the build if any has no mention in `docs/data-sources.md`. Run `npm run presubmit` (lint + tests + inventory check) before committing source work; a prose rule alone is not enough.

Keep the tracker readable by both humans and coding agents:

- Use the stable source ID already in the tracker, or add one in lowercase kebab-case.
- Keep one source per list item.
- Preserve the standard labels: `Priority`, `Status`, `Value`, `Preserved information`, `Coverage`, `Progress`, `Next step`, and `Notes`.
- Mark implementation artifacts explicitly as `[x]`, `[ ]`, or `[~]` for partial/in-progress.
- Include concrete paths for implemented or planned adapters, loader scripts, configs, and tests.
- Do not mark a source ready for public display until approval/terms and display policy are complete.

## Continuous Source Addition Loop

Use this loop for repeated or 7x24 source expansion work. Each pass should be a bounded unit of work: research one source, add one config, build one adapter, or finish one source through tests and docs.

1. Record the starting git state with `git status --short --branch`. Expect unrelated dirty files and do not stage, revert, or commit changes outside the current pass.
2. Pick the next source by product value and deployability: prefer recent official/bulk/API sources with real person names plus source-observed addresses, phones, or explicitly published emails; prefer sources that reuse existing adapters; demote stale, aggregate-only, context-only, sensitive, blocked, or license-unclear sources.
3. If the backlog/tracker has no suitable ready source, run a bounded new-source detection pass instead of stalling. Search only for official public-data portals, agency bulk downloads, records-request exports, or licensed-provider candidates; compare every candidate against existing `sourceId`s and `docs/data-sources.md`; reject sources with unclear terms, sensitive/prohibited use, scraping-only access, aggregate-only value, or no person-bearing fields. Add the best candidates to the `Potential Source Tracker` with approval status, fields, coverage, refresh cadence, adapter fit, and the next implementation step.
4. Run the source approval workflow before implementation. Record source URL, terms URL, fields, coverage, refresh cadence, protected-address handling, and review date before enabling ingestion.
5. Implement the smallest safe integration path. Use existing configurable adapters first (`ArcGIS`, `Socrata`, `CKAN`, `Opendatasoft`, official JSON/XML/delimited, or approved CSV). Build a custom adapter only when the source is high value and does not fit an existing adapter.
6. Treat phones, emails, street addresses, and raw names as sourced PII. Import them only when the approved source explicitly publishes them, preserve provenance, and never infer them from names, affiliations, usernames, domains, or publication metadata.
7. A source pass is not complete until mapping and failure behavior have unit-test coverage, the relevant validation commands pass, `docs/data-sources.md` is updated, and tracker/table checkboxes match the actual code state.
8. After a clean completed pass, stage only the files changed for that pass, commit them with a concise source-specific message, and push the current branch. If validation fails, the pass is incomplete, there are unresolved unrelated changes in the files to commit, or push is blocked by auth/remote conflicts, do not commit; leave a concise resume note instead.
9. If a pass cannot be completed cleanly in the current run, preserve progress in docs or code comments already in scope; do not leave a partially finished adapter marked as ready.

## Architecture Map

- App routes live in `app/`.
- Shared React components live in `components/`.
- Database entrypoint is `lib/db.ts`.
- Database modules live in `lib/database/`.
- Source adapters live in `lib/sources/`.
- Ingestion CLIs live in `scripts/`.
- Source configs live in `configs/`.
- Requirements live in `docs/requirements.md`.
- Source inventory and roadmap live in `docs/data-sources.md`.
- Existing adapter workflow notes live in `docs/source-adapters.md`.

## Search And Data Behavior

- Name searches refresh every built-in approved source unless that source/query pair was refreshed within `NAME_SOURCE_REFRESH_TTL_SECONDS` or the default one-day TTL. A source is re-fetched for a query only when it has not been fetched in the last day (e.g. a newly added source that has never been fetched for that query); already-fetched sources are not re-fetched repeatedly.
- Search result caches use hashed, normalized query keys. Do not store raw search terms in cache tables.
- Search cache TTL is controlled by `SEARCH_RESULT_CACHE_TTL_SECONDS`.
- Local SQLite data may exist on the developer machine while remote git manages code. Do not commit local raw data or generated SQLite databases.
- Use approved source configs and ignored raw storage for downloaded payloads.

## Database And Entity Resolution

- Preserve raw source record payloads for audit/provenance where the source is approved.
- Merge records only when there is strong evidence such as exact name plus birth date, email, phone, or clearly matching source identifiers.
- Name-only matches are weak. Keep them separate unless a dedicated merge job or rule has enough corroborating evidence.
- Keep address history as source-observed location history, not as proof of current residence.
- Filter non-geographic source metadata out of public location summaries.

## UI Rules For This Product

- The main workflow is search first. Do not turn the homepage into a marketing-only landing page.
- Keep FCRA/prohibited-use language visible but secondary to the search workflow.
- Use uncertainty language: possible match, may be inaccurate, source-observed, source-backed.
- Keep opt-out and report/correction paths visible.
- Do not expose raw source IDs or long source metadata blobs as names or aliases.
- Use privacy-safe ad placeholders/integration; never pass PII to ads.

## Testing And Verification

Run the smallest relevant test first, then broaden based on risk.

Common commands:

```bash
npm run test
npm run lint
npm run build
git diff --check
```

For source work, also run the relevant adapter test and any config validator:

```bash
npm run sources:validate-property
npm run test -- tests/<source>.test.ts
```

## Git Hygiene

- Expect a dirty worktree. Do not revert changes you did not make.
- Keep edits scoped to the user's request.
- Do not commit local data, raw downloaded files, `.next`, SQLite databases, or secrets.
- Update docs when behavior changes.
