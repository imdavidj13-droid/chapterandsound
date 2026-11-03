# Unified manual catalogue editor — release and verification (2026-11-03)

## One user-facing catalogue

- **Admin → Book Catalogue** is the canonical editorial entry point for manual books, authors, editions, audiobooks, series and identifiers.
- The old "Website Books", "Website Editions" and "Website Contributors" admin tabs have been removed from navigation. Their existing records are **not deleted**.
- The Add Book screen is a forest-green, mobile-responsive, single-page form: book identity and author, first edition, ISBN-13/ISBN-10/ASIN, publisher/release date, conditional audiobook fields and cover preview.
- The **Author** input is one searchable field. An existing canonical author is reused; if only a legacy website person exists, its original person ID is copied non-destructively to the canonical database. New people are added only when no name match exists. Ambiguous matches block auto-merge and require human review.
- Existing website people are preserved in BOOK_DB on authenticated first admin visit by a bounded, idempotent copy process; no legacy person is removed. This copy is not a verified *same-person* merge of distinct IDs.
- New works and their optional first editions and narration are saved as one atomic D1 batch; no manual draft approval.
- Public catalogue queries read published BOOK_DB works, series, people, editions, cover assets and narrator credits. Existing website books and reviews remain available by their original IDs. The member review/shelf compatibility bridge creates only a minimal same-ID application-DB foreign-key reference if the selected canonical book does not yet exist there.
- The first edition's cover is a fallback when no work-level cover exists. Public book details combine canonical book metadata with the existing app DB's reviews and rating aggregates.

## Media storage / permission

The Worker configuration binds a dedicated **private** R2 bucket `chapterandsounds-catalogue-media` as `CATALOGUE_MEDIA`. The bucket must actually be created in the intended Cloudflare account before deploying:

```powershell
cd C:\Projects\chapterandsound
npx wrangler r2 bucket list
# Only if chapterandsounds-catalogue-media is missing:
npx wrangler r2 bucket create chapterandsounds-catalogue-media
```

This bucket must remain private; do **not** enable its R2 public development URL. The application publishes only approved, owner-uploaded assets through `/api/catalogue-media/:id`. Uploads require declared rights holder, licence/permission, HTTPS source URL, and explicit admin confirmation. A selected file can be previewed without uploading it. If R2 isn't configured, the editor saves book details but can't store the cover.

## Deploy

After R2 creation is verified, on the user's Windows machine:

```powershell
cd C:\Projects\chapterandsound
git pull origin main
npm run typecheck
npm test
npm run test:catalogue-schema
npm run build
npx wrangler deploy
```

No additional migrations were introduced by this editor release; all five catalogue migrations must already be applied to `chapterandsounds-book-db`.

## Acceptance checks on live application

1. Sign in as site administrator; navigate to Book Catalogue. Confirm there is **one** Add Book form, one Author field and no "Website Books" etc tabs.
2. Search for an existing contributor (e.g. Simon Kernick). Confirm there is only one canonical selection, and ensure no ambiguous duplicate warning requires review.
3. Add one **real** book with a known author and valid ISBN, publisher and first edition. Confirm it saved once and appears in public /books search.
4. Open the book's public details. Confirm edition metadata; where audio selected, confirm narrator and runtime. Avoid using fabricated source details.
5. With a licensed image and R2 present, preview, upload and confirm cover on public book listing and page.
6. Sign in as a member, add the new book to a shelf and submit/publish a review. Confirm public book page shows the canonical metadata **and** the member review/rating.
7. Verify an old website book, author, and existing member review/shelf remain intact.
8. Check for duplicates, browser console errors, and Cloudflare Worker logs on error paths.

## Known limitations / risks before general public launch

- Code CI does **not** establish that Cloudflare's live BOOK_DB schema, R2 permissions, auth session, member tables or actual end-to-end writes work. A release smoke test is required.
- The two D1 databases remain distinct under the hood because existing member foreign-key references live in the application DB. BOOK_DB is the editorial source of truth; a minimal application-DB compatibility reference is retained as a technical detail. A fully single-DB design would require a wider member schema migration.
- Cross-database read merging is bounded for the current early catalogue. Correct global pagination/search at scale needs a unified read index/cutover strategy.
- Distinct author identities with the same name are intentionally **not** automatically merged. Review ambiguous identities rather than overwriting legacy data.
- Advanced unlinking/merges, all 59 table-level editorial controls, comprehensive media rights revocation and production recovery testing remain separate tasks. Do not interpret passing CI as a complete catalogue launch.
