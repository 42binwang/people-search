# People Search

Free, ad-supported public lookup website for finding possible people, phone, and address records from lawful public or licensed data sources.

The project requirements and implementation checklist live in [docs/requirements.md](docs/requirements.md).

## Product Direction

- Free public lookup site monetized with display ads.
- Search modes: name, phone, and address.
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
- `npm run ingest:nppes -- --last=Smith --first=John --state=CA --limit=10` imports limited CMS NPPES provider records.
- `npm run collect:source -- configs/source.json` fetches an approved source payload into ignored raw storage.
- `npm run lint` checks code style.
- `npm run build` verifies a production build.

The search results page also performs bounded automatic NPPES ingestion for name searches, then re-runs local search against the imported records.
