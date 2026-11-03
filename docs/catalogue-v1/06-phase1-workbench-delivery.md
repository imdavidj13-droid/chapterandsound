# Dedicated Catalogue Workbench — Phase 1 delivery (2026-11-03)

## Scope delivered

- Second D1 binding `BOOK_DB` points to Cloudflare database `chapterandsounds-book-db` (`961d5433-d7f8-4b8c-b84a-d9cad1a9a56a`). Existing `DB` binding remains unchanged.
- `/api/catalogue-admin/*` uses existing Better Auth session, verified owner email, and persisted `site_roles.role='admin'` before accessing BOOK_DB.
- All catalogue write operations reject a cross-origin browser request and use D1 `batch()` to combine the draft insert, revision and audit statement (or credit + audit).
- `/admin` now has a **Book Catalogue** module. It shows a clear schema-not-installed message until BOOK_DB migrations have been applied.
- Admin can create **private draft works**, **provisional contributors**, **draft editions**, and **draft audiobook recordings**, plus attach authors/coauthors to works and narrators to recordings.
- Admin can read the first 100 live records in each category. These first-release lists are intentionally limited; full server-side paginated search, edits and merge tools remain to be built.
- Cover upload explicitly disabled until secure Cloudflare R2 workflow exists; it does **not** store browser-only data or imply success.
- Public book pages, member shelves and reviews **still use original application DB**. No external publication, public API, data migration, member data update, R2 bucket, or import was performed.

## Tests

GitHub CI validates TypeScript, existing app tests, legacy migrations, isolated 28-table catalogue migrations, browser-storage audit and Worker build. This establishes code/build readiness but does not prove that the production BOOK_DB has migrations installed.

## Installation steps when owner is ready

From repository root in PowerShell:

```powershell
git pull origin main
npm run test:catalogue-schema
npx wrangler d1 migrations apply BOOK_DB --remote
npx wrangler deploy
```

**Important:** Wrangler must display `chapterandsounds-book-db` as the target for catalogue migration. Do not use `DB` or manually run the app's `migrations/` SQL against BOOK_DB. The migration command is a real production D1 schema change; inspect the prompt before accepting. No seeded books or contributors are inserted by these migrations.

Once deployed, log in as verified site administrator, open `/admin`, choose **Book Catalogue**, create a test *real* book as an unpublished draft, create its contributor, then assign an author credit. Check that both records persist after refresh. Don't publish to the public site until the legacy-ID migration and public-read service are implemented.

## Required next development stages

1. Add read-modify-write with `revision` checks, source claims, safe conflict handling and approved publication flow.
2. Full catalogue searches and paginated selectors, duplicate detection before creation.
3. Secure R2 media bucket/upload/validation/rights/link workflow with failure recovery; user must provision or authorise an R2 bucket then.
4. Expand edition identifiers (ISBN checksum, ASIN by market), publisher/imprint, series, language and audio recording edit panels.
5. Create safe mapping between existing app DB work/edition/person references and BOOK_DB, then shadow-read, verify and cut over public book pages.
6. Only after source licences, quotas and API governance are reviewed, expose an external v1 API.

## Risk boundaries

- The new catalogue DB is not yet the website's public source of truth.
- An admin-created draft is private to the admin service; it is not searchable by site members.
- Do not remove legacy catalogue tables or migrate reviews/shelves without an audited ID crosswalk.
- Role checks are server-side; the admin menu alone is not a security control.
