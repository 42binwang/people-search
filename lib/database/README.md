# Database Module Layout

`@/lib/db` remains the public compatibility facade for application code, source
adapters, scripts, and tests.

New database work should use the domain modules in this folder:

- `core.ts` owns connection access.
- `profiles.ts` owns person/profile search and profile upserts.
- `sources.ts` owns source registration and source refresh provenance.
- `search-cache.ts` owns cached search result state.
- `privacy.ts` owns privacy requests, abuse reports, and admin review actions.
- `feedback.ts` owns record feedback writes.
- `rate-limits.ts` owns route rate-limit event checks.
- `aggregates.ts` owns aggregate housing, mobility, income, and permit metrics.

`legacy.ts` contains the pre-refactor implementation and schema DDL. Keep it as
a compatibility layer while moving implementation into the domain modules in
small, tested slices.
