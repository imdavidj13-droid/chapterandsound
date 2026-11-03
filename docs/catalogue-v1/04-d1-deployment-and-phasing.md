# Catalogue v0.2 — Concrete database identity and initial release scope

**Status:** Approved database target, **proposed structure pending v1.0 freeze**. This document is a deployment plan, not a migration script.
**Date:** 2026-11-03.
**User-created Cloudflare D1:** `chapterandsounds-book-db`.
**Database UUID:** `961d5433-d7f8-4b8c-b84a-d9cad1a9a56a`.
**Proposed Worker binding:** `BOOK_DB` (the existing application `DB` binding is preserved).

## Separation

| Responsibility | Existing application DB | New catalogue DB |
|---|---|---|
| Accounts, sessions, email verification, user roles | Yes | No |
| Bookshelves, reviews, reading goals and private notes | Yes | No |
| Member-submitted missing-book requests | Yes | No (could receive privacy-safe editorial work items) |
| Canonical books, editions, recordings, people and series | Transitional copies, then references | Yes — master |
| Approved covers / portraits | Transitional image mappings | R2 bytes, indexed in catalogue DB |
| Publishing metadata, identifiers and provenance | Transitional copies | Yes — master |
| Catalogue editorial audit and quality | Existing legacy audit during migration | Yes — cataloguing operations |

**Cross-DB consistency:** No SQL FK can reference a row in another D1 database. Existing FKs must remain valid in the application DB until a reviewed cutover. New application write flows store stable catalogue UUIDs and keep required local relational integrity or use a staged reference migration. A new `catalogue_id_mappings` table will be placed only in the app DB **at cutover time**, not now.

## Full name registry

The 59 names in [01-table-registry.md](01-table-registry.md) form the canonical **proposed table namespace**. Do not silently rename them while implementing. Domain roles are set. The set is comprehensive, but final columns, constraints, and physical implementation details remain a review candidate, not yet an executable schema.

### First functional catalogue release (25 tables)

`works`, `work_titles`, `work_versions`, `editions`, `publication_events`, `audio_recordings`, `edition_recordings`, `people`, `person_names`, `contributions`, `organisations`, `publishers`, `imprints`, `series`, `series_memberships`, `identifier_schemes`, `entity_identifiers`, `media_assets`, `media_links`, `media_rights`, `metadata_licences`, `metadata_sources`, `source_records`, `field_claims`, `catalogue_audit_log`.

Purpose: create a work, contributor, edition, audiobook recording, identifiers, cover and auditable source data. No blanket requirement to populate optional metadata, no fictional seed books.

### Later schema modules, still reserved in the 59-table design

- Relationships and technical detail: `work_relationships`, `work_languages`, `edition_details`, `edition_relationships`, `edition_languages`, `audio_tracks`, `audio_recording_details`, `organisation_names`, `publisher_imprints`, `series_relationships`.
- Extended discoverability: `classification_schemes`, `subjects`, `work_subjects`, `content_advisories`, `audience_descriptors`, `descriptor_definitions`, `record_descriptors`, `text_content`.
- Media/distribution: `media_variants`, `territories`, `distribution_rights`, `product_offers`, `availability_events`.
- Ingestion/review/record lifecycle: `record_aliases`, `import_batches`, `import_errors`, `verification_reviews`, `record_revisions`, `merge_events`, `editorial_overrides`.
- Future external API: `api_clients`, `api_keys`, `api_usage_daily`, `api_access_policies`.

**Important:** Publishing and draft workflows need a reliable revision/version field from the first migration; `record_revisions` and `verification_reviews` might need moving forward into the first release when transactional design is reviewed. Likewise `text_content` must be moved forward if long-form descriptions or summaries are editable on day one. This is a release-scope proposal, not permission to omit required tables.

## D1-specific constraints

- Proposed D1 binding must be added as a **second** object, keeping existing `DB` untouched; never replace its database UUID.
- The catalogue should have its **own migration directory**. Existing `migrations/` contains live app DB migrations; never run those against the new catalogue.
- Do not run `wrangler d1 migrations apply DB --remote` expecting to update `BOOK_DB`, or vice versa.
- The initial service may use `BOOK_DB` on an independent catalogue Worker; production API traffic should go through a service interface, not arbitrary frontend SQL.
- Use JSON-aware constraints and partial unique indexes where supported. Any integer duration uses seconds; ISBNs/ASINs are strings.
- Cloudflare D1 max single DB is 10 GB paid / 500 MB free. This database is a sensible starting destination, **not proof that it can store every global edition permanently**. A representative size and throughput benchmark precedes mass ingestion.
- Dates with unknown precision are represented as nullable year/month/day components or a validated partial-date text plus explicit precision; do not create fake day/month values.
- The cataloguing admin authenticates through existing Chapter & Sound sessions/roles and a protected server-to-server channel; the new catalogue DB never contains copies of password/session/member data.

## Future Worker configuration illustration — DO NOT APPLY YET

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "chapterandsound-db",
      "database_id": "e7d649b1-0054-4509-9a43-d662976d383d"
    },
    {
      "binding": "BOOK_DB",
      "database_name": "chapterandsounds-book-db",
      "database_id": "961d5433-d7f8-4b8c-b84a-d9cad1a9a56a",
      "migrations_dir": "catalogue-migrations"
    }
  ]
}
```

If using a separate Worker configuration instead, only bind `BOOK_DB` to that dedicated service and communicate via authenticated service bindings. This is preferred for the future external API and stronger isolation.

## Before running the first migration

1. Approve v1.0 table/column list, including the foundational revision and source/licensing tables.
2. Confirm migration directory, Worker isolation, backup/restore and dedicated **staging catalogue DB** (not the production UUID above).
3. Generate executable SQL from the schema specification; run in disposable SQLite with FK, CHECK, duplicate and right-to-delete tests.
4. Verify manual edit → edition/recording → media link → public read end-to-end with no dummy live content.
5. Apply staged migrations to staging, measure real indexes/storage, and inspect schema by SQL introspection.
6. With explicit go-ahead, back up the production DB, apply only the validated catalogue migrations to `BOOK_DB`, and wire up read-only routes before enabling writes.

**Current operational status:** new database created by user; catalogue tables, R2 integration and bindings have not been installed as part of this planning step.
