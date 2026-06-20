# Coding Agent Guide

Last updated: 2026-06-20

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

Keep the tracker readable by both humans and coding agents:

- Use the stable source ID already in the tracker, or add one in lowercase kebab-case.
- Keep one source per list item.
- Preserve the standard labels: `Priority`, `Status`, `Value`, `Preserved information`, `Coverage`, `Progress`, `Next step`, and `Notes`.
- Mark implementation artifacts explicitly as `[x]`, `[ ]`, or `[~]` for partial/in-progress.
- Include concrete paths for implemented or planned adapters, loader scripts, configs, and tests.
- Do not mark a source ready for public display until approval/terms and display policy are complete.

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
