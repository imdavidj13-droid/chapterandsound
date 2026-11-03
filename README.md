# Chapter & Sound

A community reading and audiobook tracking platform. **Catalogue-first development**: public website implementation is intentionally gated on verified catalogue discovery, matching, rights and coverage.

## Current phase: catalogue engineering

- Canonical works, editions/recordings, contributors and stable source identifiers.
- Provider adapters (Open Library, Google Books, and separately evaluated audiobook sources).
- Field provenance, unresolved matches and protected manual corrections.
- Repeatable benchmark against 21 supplied audiobook titles.
- Cloudflare D1 schema, without connecting a production database.
- No fabricated books, reviews, reading dates, ratings or runtime totals.

See [docs/CATALOGUE_PLAN.md](docs/CATALOGUE_PLAN.md) for readiness gates and [docs/ROADMAP.md](docs/ROADMAP.md) for the full approved product scope.

### Development

Requires Node 22+.

```powershell
npm install
npm test
npm run typecheck
npm run benchmark -- --provider openlibrary
```

Live benchmark commands call third-party APIs; tests use fixtures only. No website is deployed and no cloud resources are created by this repository.

## Source and image rights

Open Library is intended for human-oriented lookup, **not a bulk or high-traffic third-party database backend**. The audiobook integrations require independent usage/retention and image-rights verification before production. Search results are candidates, not verified canonical identities. Never bulk-download or republish third-party images without permission.

## Operational rule

Do not implement or deploy the public website until catalogue readiness is reviewed. No production writes, paid subscriptions or outgoing email are performed by these scripts.
