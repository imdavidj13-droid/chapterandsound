# Simon Kernick: controlled 10-book pilot (2026-11-04)

## Status
Pilot **selected**, not imported. This manifest is a list of ten grounded titles only, not fabricated Open Library work IDs or editions. **No production D1 writes.** Existing published `The Business of Dying` is excluded.

The verified Open Library author identity is `/authors/OL1516279A`. Source: https://openlibrary.org/authors/OL1516279A/Simon_Kernick . The selection comes from Open Library's author bibliography and is intended to exercise different editions and publication eras.

Selection file: `pilot/simon-kernick-10-titles.txt`.


## Preferred next step: targeted API fetch (no full-dump scan)

The first complete local dump scan on 4 November 2026 already identified the 34
Open Library work IDs and their provisional grouping. **Do not rerun the bulk
preparer for this pilot.** To collect complete edition records without scanning
the ~114 million local records again, use the small cached API fetcher:

```powershell
cd "C:\Projects\chapterandsound"
git pull origin main
node scripts/fetch-openlibrary-pilot.mjs --resolution-file "pilot/simon-kernick-resolution.json" --out ".private-catalogue-pilot"
```

The fetcher reads the exact work IDs already in the resolution file, calls Open
Library's work and editions JSON endpoints sequentially with a modest delay,
and saves every successful response under
`.private-catalogue-pilot/openlibrary-cache/`. It is **resumable**: a subsequent
run reuses cached pages. It produces `api-report.json` and
`api-candidates-01.json`, distinct from the older dump-scan files. These are
**review-only** and are not automatic production import manifests.

The live API may have changed since the October snapshot. The fetcher verifies
source work keys and the selected author's identity, and flags unexpected titles
and metadata collisions instead of silently accepting them. Edition formats
remain `unknown` unless grounded by the source's physical format. No narrator
or audio duration is guessed. Matching ISBNs are grouped as potential duplicate
edition identities with source aliases retained; format/publisher/date conflicts
are reported for review.

**No Cloudflare calls, no D1 writes and no book publication.** Production drafts
still require verified canonical identity mappings, import compatibility
checks, completeness checks, and the normal preview/backup/rehearsal gates.

## Why this pilot is different

Open Library's author profile contains multiple work records for some of the same novels. The offline preparer now accepts a **verified author ID plus title allowlist**; it reports ambiguous or missing work matches rather than picking one arbitrarily. An explicit, provisional canonical-work mapping may be used to combine matching source IDs; those records remain marked for identity review. It preserves all linked edition records, identifies ISBNs at edition level only, and reports incomplete fields.

Open Library's bulk exports are published monthly. Obtain the matching three dumps (works, authors, editions) from https://openlibrary.org/developers/dumps, using the same snapshot where available. These are large files; enough storage is required. Do not use its live API to harvest the full dataset.

Run locally, inside the repository, after placing the three downloaded gzip files in a separate data directory (substitute their actual paths):

```powershell
node scripts/prepare-openlibrary-pilot.mjs --works "D:\catalogue-dumps\works.txt.gz" --authors "D:\catalogue-dumps\authors.txt.gz" --editions "D:\catalogue-dumps\editions.txt.gz" --author-key "/authors/OL1516279A" --titles-file "pilot/simon-kernick-10-titles.txt" --max 10 --out ".private-catalogue-pilot"
```

Output: `report.json` and candidate files only for selected, unambiguous works. By default duplicates stay unresolved, with their source IDs and ISBN samples shown in the report.

### Reviewed consolidation from the 2026-10-31 report

The 4 November pilot found **34 competing Open Library work IDs across the ten requested titles**, associated with **79 edition relationships** (not necessarily 79 unique editions). The provisional source-ID grouping is preserved in `pilot/simon-kernick-resolution.json`. It is **not** a declaration that every source edition or metadata field is verified.

After pulling the latest repository revision, rerun the preparation with the same arguments plus:

```powershell
--resolution-file "pilot/simon-kernick-resolution.json"
```

This verifies that the *exact same set* of source work IDs still matches each title and author. Any changed/unknown source work ID blocks that title from automatic selection. The resulting candidates include one canonical work per matched title, `sourceWorkKeys` for all mapped aliases, and edition-level source identifiers. Repeated edition identifiers and identical valid ISBN-13 values are grouped while their aliases are recorded. Metadata disagreements are flagged in the review report.

**These candidates remain provisional and must not be automatically published or imported without an identity and completeness review.** The preparer makes no Cloudflare or database writes. The local gzip dumps must be rescanned to extract complete edition information; the existing summary report alone did not preserve all edition fields.

This is groundwork for a future public API: public clients receive one canonical work with separate verified editions and their format-specific metadata, rather than multiple source work records.

## Requirements before writing anything

1. Confirm `npm run typecheck`, `npm test`, `npm run test:catalogue-schema`, `npm run build` pass on the exact revision containing the pilot.
2. Validate source-use rights and available edition metadata. Do not invent synopses, publisher details or audiobook narrators. Covers are deferred.
3. Preview the manifest in Admin → Book Catalogue → Import Centre; ensure zero identity/ISBN collisions and no unresolved mandatory or pilot quality fields.
4. Back up live `BOOK_DB` and verify backup readability. The existing published work, Simon Kernick contributor ID and member relationships must be preserved.
   - Windows helper: `powershell -ExecutionPolicy Bypass -File scripts/backup-book-db.ps1`. This runs a read-only `wrangler d1 export --remote`, saves a timestamped SQL file outside the deployed app, and prints its SHA256. It does not establish restore success.
5. Rehearse the transaction against a disposable database with identical migrations. Verify 10 drafts, expected edition counts, and no publicly visible changes.
6. Only then explicitly approve a production draft import. The current runtime cannot directly access the user's Cloudflare account, so production execution cannot be claimed.

**Note:** All-edition completeness may not be obtainable from Open Library alone. Records with unresolved metadata must be enriched from rights-compatible sources or held; the ten selected titles are not guaranteed to be importable in one shot.

## Initial ten titles
1. Relentless
2. Siege
3. The Crime Trade
4. A Good Day to Die
5. The Payback
6. The Murder Exchange
7. Severed
8. Ultimatum
9. Stay Alive
10. The Final Minute

The provisional canonical and alternate work IDs are recorded in the resolution file. Publication and production import remain blocked pending verification.
