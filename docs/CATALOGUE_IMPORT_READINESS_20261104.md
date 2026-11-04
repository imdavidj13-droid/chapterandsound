# Chapter & Sound — Catalogue Import Readiness and Phase 1

Date: 2026-11-04  
Target: `BOOK_DB` (`chapterandsounds-book-db`), never a second or source-specific catalogue.  
Production import execution: **DISABLED**.

## 1. Repository schema audit

The catalogue schema validator expects five migrations (`0001`–`0005`) and 59 total tables. The following are already present, so Phase 1 requires **no new migration**.

| Concern | Existing canonical tables |
|---|---|
| Works and editions | `works`, `work_titles`, `work_versions`, `editions`, `edition_details`, `publication_events` |
| Authors and contributions | `people`, `person_names`, `contributions` |
| Audiobooks | `audio_recordings`, `edition_recordings`, `audio_tracks`, `audio_recording_details` |
| Identifiers | `identifier_schemes`, `entity_identifiers` |
| Subject/series metadata | `subjects`, `work_subjects`, `series`, `series_memberships` |
| Rights and provenance | `metadata_licences`, `metadata_sources`, `source_records`, `field_claims` |
| Cover images | `media_assets`, `media_links`, `media_rights` |
| Import monitoring | `import_batches`, `import_errors`, `record_revisions`, `catalogue_audit_log`, `record_aliases` |

**Important:** `DB` remains the active member/auth/review/shelf store. It is not the obsolete misspelled book database. `BOOK_DB` is the current canonical book database. The catalogue migration suite explicitly excludes `members`, `reviews`, `session`, and `reading_experiences`.

### Live data state

This was a **repository schema and code audit**, not a direct query of production Cloudflare D1. The schema validator and migrations were inspected, but no production table counts or write tests were executed in this session. The previously published book must be preserved.

## 2. Phase 1 implementation — read-only review

Owner-only endpoint:

- `GET /api/catalogue-admin/import/discover?q=<search>`: one manually initiated Open Library search, maximum 10 results, with a fixed external host. It does not store the response. Because search aggregates editions, it does not choose an arbitrary ISBN from multiple editions.
- `POST /api/catalogue-admin/import/preview`: accepts 1–100 candidates, maximum 300 KB, reads existing canonical edition ISBNs, previously seen source keys and title/author pairs, and produces a per-row decision report.

Accessible in **Administration → Book Catalogue → Import Centre**.

### Candidate manifest

```json
{
  "candidates": [
    {
      "sourceId": "openlibrary",
      "sourceKey": "/works/OL123W",
      "title": "Example title",
      "author": "Example author",
      "isbn13": "9780306406157",
      "format": "paperback",
      "publicationDate": "2000"
    }
  ]
}
```

The example is synthetic. Never assume the example identifiers refer to the same real edition. A complete pilot candidate now includes an explicit `editions` array, source keys for the author and each edition, description, subjects, original language and first-publication metadata.

### Preview decisions

- `existing_edition` — exact ISBN match to an existing canonical edition. **Do not create another record.**
- `review_match` — an exact title/author pair or source key exists. **Human identity review required**.
- `invalid` — required fields, ISBN checksum, format, or date validation failed.
- `duplicate_in_batch` — candidate identifier was already seen in the submitted batch.
- `needs_enrichment` — no matching ISBN or title/author, but required work or edition metadata is missing. **Hold for enrichment; do not import as complete**.\n- `create_draft` — the candidate passes the metadata completeness gate and matching checks. **Still requires source-rights and identity approval; not imported automatically**.

Preview is intentionally non-mutating. The UI does not offer an Apply or Publish action.

## 3. Recommended source intake

Open Library's official documentation requires use of monthly data dumps for large-scale/bulk access. Its API is for human-initiated, low-volume lookup, not to harvest hundreds of records. Sources:

- https://openlibrary.org/developers/dumps
- https://openlibrary.org/developers/api
- https://openlibrary.org/dev/docs/api/search

Next ingestion engine should consume approved dump snapshots or licensed feeds with source attribution and revision IDs. Audnexus can be added for audiobook-only enrichment after separate schema and source-rights verification.

Do **not** automatically download and republish images: image rights and metadata reuse permissions require independent evaluation. `coverUrl` from an external source should not be treated as permission to copy or publicly display the image.

## 4. Offline pilot manifest preparation

`scripts/prepare-openlibrary-pilot.mjs` streams the official monthly works, authors and editions TSV+gzip dumps **locally**, resolves only requested work keys, retains **all edition-level records** for each selected work (even those with incomplete ISBNs), and emits batches of no more than 100 candidate works. No API harvesting, D1 writes or publication is involved.

Example `pilot-work-keys.txt`:

```
/works/OL123W
/works/OL456W
```

Use **actual verified Open Library work identifiers** for your chosen pilot set; the lines above merely illustrate the expected format.

```powershell
node scripts/prepare-openlibrary-pilot.mjs --works "D:\\catalogue-dumps\\ol_dump_works_latest.txt.gz" --authors "D:\\catalogue-dumps\\ol_dump_authors_latest.txt.gz" --editions "D:\\catalogue-dumps\\ol_dump_editions_latest.txt.gz" --seeds "pilot-work-keys.txt" --out ".private-catalogue-pilot"
```

Generated files: `candidates-01.json`, `candidates-02.json`, etc. and `report.json`. Paste these batches into Admin → Book Catalogue → Import Centre for the dry-run check.

- The script intentionally **does not** automatically use Open Library cover images or text descriptions.
- Ambiguous/multiple authors are reported for manual review.
- A work with no edition records is skipped and reported. Editions missing ISBNs remain visible and are flagged for enrichment; identifiers are never invented.
- No generated output is automatically deployed or imported.
- Official monthly dump downloads can be large; consider sufficient disk space and run locally rather than in a Cloudflare Worker.

## 5. Next implementation gate (not yet complete)

A real 250-book pilot requires:

1. A reproducible source snapshot and parser, with provenance and source-specific field mappings;
2. edition-level identifiers, not a random ISBN from work-level search;
3. author identity matching and conflict review, including same-name different-person cases;
4. transactional draft-only writes into existing `BOOK_DB` tables, using `import_batches` and `source_records`;
5. import replay/resume, atomic rollback on failure, and reconciliation to legacy member references where needed;
6. a backup of production BOOK_DB and a disposable staging test before any production writes;
7. review of the first 250 candidates and written reconciliation metrics before expansion to 2,000.

No production import, publication, database deletion, migration or identity merge should be inferred from a successful dry run.

## 6. Verification

New test files:
- `tests/catalogue-import-preview.test.ts` — SQLite migration-backed matching, checksum and no-write checks;
- `tests/catalogue-import-boundaries.test.ts` — owner permission, dry-run, bounded source lookup.\n- `tests/openlibrary-dump-preparer.test.ts` — compressed fixtures for offline source processing.

CI/build execution and deployment still need independent verification; source commits alone are not evidence that a Worker endpoint is live.


## Metadata completeness gate added

The preview now shows **Needs metadata**, an edition count, a completeness score and the exact fields missing from each work/edition. Work-level Open Library search results cannot pass as complete editions.

Required checks cover: canonical title, source-backed author identity, description, subjects, language, first-publication information, and every edition's source ID, format, ISBN, publisher, release date and language. Verified audiobook editions additionally require source-backed narrator identities and duration.

**Important:** A strict completeness gate is not a guarantee that every published book has every piece of metadata available anywhere. Some publishers and sources omit fields. Those records must be enriched using a compatible, rights-permitted source or held for review. No data is fabricated. Cover ingestion is deliberately deferred until the metadata pipeline is reliable.

Regressions: `tests/catalogue-import-quality.test.ts` and the updated import preview and dump fixture tests.

## Owner-initiated edition enrichment (added)

For a small manually searched book, Admin → Import Centre now offers **Get book & editions**. This performs an explicit read-only fetch for one Open Library work and its first page of edition records, then replaces that candidate's work-level search summary with a richer draft manifest. The next **Preview batch** call reports the field-level gaps.

- The endpoint is `GET /api/catalogue-admin/import/enrich?workKey=/works/OL...W`, restricted to the existing authenticated owner route.
- It reads the work JSON and at most **50 editions** (not 50 separate single-book calls).
- If Open Library reports more editions than were returned, `editionCountReported` is retained and the completeness gate blocks import until the offline dump fills the gap.
- It preserves publisher, date, language, formats and edition-level ISBNs where actually supplied, but **does not** infer a format from an absent `physical_format`.
- Audio narrator/duration and catalogue rights remain separate requirements. Covers are out of scope.
- Search result author text is retained, but source author identifiers are checked independently; no automatic same-name author merge occurs.
- Only manually initiated, low-volume API lookup is supported. Bulk workflows use the downloaded monthly dumps.

This is a **pre-import metadata review**, not a production bulk ingestion engine. No live data was imported, and it is not a promise that every field exists in Open Library. Records with gaps must be enriched from compatible sources or held without pretending they are complete.
