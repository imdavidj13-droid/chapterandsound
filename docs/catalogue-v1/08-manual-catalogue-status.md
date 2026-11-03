# Manual catalogue administration — implementation state (2026-11-03)

## Canonical user workflow

The dedicated, cloud-only catalogue lives at **Admin → Book Catalogue** and writes to `BOOK_DB` (`chapterandsounds-book-db`). The old **Website Books (legacy)**, **Website Editions (legacy)** and **Website Contributors (legacy)** pages remain read/edit views of the original application `DB`; their new-record buttons have been removed to avoid duplicate future entry. No legacy records were deleted, copied, or synchronised.

**Do not add a second copy of an existing author solely to make them appear publicly.** An administrator must audit source IDs and build a migration/crosswalk from `DB` to `BOOK_DB` before public catalogue cutover.

## Delivered manual controls

The main Book Catalogue creates and edits canonical books and a synopsis. The Detailed Catalogue Management area supports direct creation of:
- People (authors and narrators), biographies, names, partial birth/death dates; editing existing profiles
- Print and digital editions, titles, formats, page counts and language; editing existing editions
- Audiobook recordings, language, runtime, abridgement, performance type and recorded date; editing existing recordings
- Publishers, organisations, imprints and series
- Link contributors to books, editions or recordings (including narrator roles)
- Alternative titles, series membership and reading sequence
- Identifier schemes and ISBN-10/ISBN-13 (checksum-validated), ASINs and market-scoped IDs
- Classification schemes, genre/subject records, assignments to books
- Edition publication events and publishers
- Associate recording(s) with an audiobook edition and enter chapter tracks

New manual entries are persisted directly; there is no draft approval submission workflow. Details remain nullable if unknown rather than invented.

## Boundaries still to complete

This phase is not a complete interface over all 59 tables. Internal/source/audit/API governance tables do not need public-facing manual entry. Remaining editorial functions requiring work include:
- Secure R2 uploads of edition covers and people portraits; rights grants and takedown/asset lifecycle
- Source claim/provenance editors, media licensing and publication eligibility
- Edit, unlink, correct and merge controls for every relationship, identifier and classification, with safe audit/history
- Mass-scale searchable/paginated pickers and duplicate warnings before saves
- Publisher/imprint, physical edition, track technical, advisory, audience, territory and distribution detail panes
- Public read cutover and migration from legacy `DB` including stable ID crosswalk and account reviews/shelves

The public site still queries the legacy `DB`, not BOOK_DB. Its public author directory (`/api/people?role=author`) requires an author credit linked through legacy `work_contributors`. Adding only a person profile does not place them in the public author search, and adding to BOOK_DB cannot affect that directory until public integration is complete.

## Deployment

No new SQL migrations required; the user reports all five migrations already applied to BOOK_DB. To deploy the new Worker/UI code:

```powershell
cd C:\Projects\chapterandsound
git pull origin main
npm run typecheck
npm run test:catalogue-schema
npm run build
npx wrangler deploy
```

Code CI does not test actual production D1 data or simulate a verified-owner session. After deployment, check each manual save persists through a page reload in the Book Catalogue; do not use the legacy screens for new books.
