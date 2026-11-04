# Simon Kernick: controlled 10-book pilot (2026-11-04)

## Status
Pilot **selected**, not imported. This manifest is a list of ten grounded titles only, not fabricated Open Library work IDs or editions. **No production D1 writes.** Existing published `The Business of Dying` is excluded.

The verified Open Library author identity is `/authors/OL1516279A`. Source: https://openlibrary.org/authors/OL1516279A/Simon_Kernick . The selection comes from Open Library's author bibliography and is intended to exercise different editions and publication eras.

Selection file: `pilot/simon-kernick-10-titles.txt`.

## Why this pilot is different

Open Library's author profile contains multiple work records for some of the same novels. The offline preparer now accepts a **verified author ID plus title allowlist**; it rejects ambiguous or missing work matches rather than picking one arbitrarily. It preserves all linked edition records, identifies ISBNs at edition level only, and reports incomplete fields.

Open Library's bulk exports are published monthly. Obtain the matching three dumps (works, authors, editions) from https://openlibrary.org/developers/dumps, using the same snapshot where available. These are large files; enough storage is required. Do not use its live API to harvest the full dataset.

Run locally, inside the repository, after placing the three downloaded gzip files in a separate data directory (substitute their actual paths):

```powershell
node scripts/prepare-openlibrary-pilot.mjs --works "D:\catalogue-dumps\works.txt.gz" --authors "D:\catalogue-dumps\authors.txt.gz" --editions "D:\catalogue-dumps\editions.txt.gz" --author-key "/authors/OL1516279A" --titles-file "pilot/simon-kernick-10-titles.txt" --max 10 --out ".private-catalogue-pilot"
```

Output: a `candidates-01.json` and a `report.json` in `.private-catalogue-pilot`. Inspect the report. If a title matches multiple works, the preparer aborts with its title rather than hiding the duplicate.

## Requirements before writing anything

1. Confirm `npm run typecheck`, `npm test`, `npm run test:catalogue-schema`, `npm run build` pass on the exact revision containing the pilot.
2. Validate source-use rights and available edition metadata. Do not invent synopses, publisher details or audiobook narrators. Covers are deferred.
3. Preview the manifest in Admin → Book Catalogue → Import Centre; ensure zero identity/ISBN collisions and no unresolved mandatory or pilot quality fields.
4. Back up live `BOOK_DB` and verify backup readability. The existing published work, Simon Kernick contributor ID and member relationships must be preserved.
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

The work IDs and edition counts are deliberately left unresolved until checked against one source snapshot, preventing accidental creation of duplicate works.
