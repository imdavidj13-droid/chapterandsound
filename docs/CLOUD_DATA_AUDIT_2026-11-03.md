# Chapter & Sound — cloud data audit (3 November 2026)

## Scope and methods

Repository-level source review of React, Cloudflare Worker endpoints and the ordered D1 migrations. Verified a no-browser-persistence rule with `npm run test:cloud`, migration smoke tests including disposable relational writes with `npm run test:migrations`, and the GitHub CI build. **This is not a production database audit**, and no live D1 data was read or modified.

## Cloud-backed, implemented

| Area | System of record | Data and operations |
|---|---|---|
| Authentication | D1 / Better Auth | Account identity, email verification, sessions and usernames |
| Public profile | D1 members | Handles, bio and member-selected published reviews |
| Reading library | D1 | Books/editions saved as reading experiences, status, private notes, progress history |
| Reading year | D1 | Aggregations over saved reading experiences |
| Review writing | D1 | Drafts, publication, editing, removal; publication is an explicit action |
| Reading tastes | D1 | Format, genre, mood and onboarding step preferences |
| Favourite creators | D1 | Chosen authors and narrators, with contributor-role validation |
| Personal appearance | D1 | Saved Editorial / Reading Room theme per verified member |
| Community | D1 | Discussions, replies, recommendations, clubs, challenge membership and lists |
| Review safety | D1 | Helpful votes, reports and moderation actions |
| Catalogue structure | D1 | Works, people, series, editions, contributor relationships and identifiers |
| Missing books | D1 | Requests, member history, deduplication, administrator request queue |
| Administration | D1 | Live counts, catalogue/contributor edits, announcements, curated site settings and audit records |
| Public browse | D1 | Server-filtered title/author search, edition-format filters and pagination |
| Global reviews | D1 | Published-only server-filtered review search and pagination |

## Not persistent by design

Search input, open accordions/dialogues, current result page, temporary unsubmitted form values, spoiler reveals and loading states remain in React component memory. They do not represent saved account data. A signed-out visitor has no cloud account identity to attach a persistent theme to; a configured **guest default theme** is fetched from D1, but individual guest selection is not cross-device-persistent.

## Known incomplete work — do not claim complete

1. **Catalogue ingestion and enrichment** remain deferred as requested. The schema is D1-backed but there is not yet a comprehensive, licensed bibliographic data pipeline. An empty catalogue is not a storage failure.
2. **R2 media uploads** are not implemented: profile photos, contributor portraits and cover assets need secured upload, rights/provenance and retrieval workflows. No local browser file is authoritative.
3. **Administration** still needs safe advanced member actions, complete book/edition merges, contributor relationship editors, bulk operations and additional permission workflows.
4. **Feature depth:** Reading-year visual breakdowns, club-room messaging UX, configurable challenge-rule editing and community discovery require further connected interfaces. Existing records must not be replaced by hardcoded examples.
5. **End-to-end production proof** requires testing in the deployed Worker with the correct D1 binding, migrations and auth secrets. Passing CI does not establish that remote schema versions or Cloudflare bindings are current.
6. **Privacy and terms** currently have development placeholder copy. They are not database content and must be completed before public registration is enabled.

## Regression controls

- `npm run test:cloud` scans application source for localStorage, sessionStorage and IndexedDB use, verifies essential Cloudflare D1 route contracts, the administrator gate and Worker-first API configuration.
- `npm run test:migrations` applies every migration to disposable SQLite memory and tests relational writes/reads for account prerequisites, theme, reading records, reviews, works/editions, requests and administration audit.
- GitHub Actions runs typecheck, tests, cloud contract audit, migration smoke checks and production build.

## Deployment validation checklist

After migrations and deployment, confirm `/api/health` reports bound/ready/configured. Sign in on device A, save a reading preference, change the theme, add a work to the shelf, update its status, save a private review draft, and submit a missing-book request. Sign out and sign in on device B to confirm all of those values are retrieved from D1. Verify draft reviews are not publicly visible, published reviews are, and the missing-book request appears only in its owner's history and the authorised admin queue. Do not use invented sample books to validate the catalogue.

Admin-only operations must return 401/403 to a guest and to an ordinary authenticated member. Check production migration `0008_admin_console.sql` before using the new console.
