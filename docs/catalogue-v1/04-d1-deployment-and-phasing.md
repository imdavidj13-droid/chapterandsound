# Catalogue v0.3 — Complete 59-table catalogue migration plan

**Status:** Complete 59-table SQL schema prepared in five additive migrations. The user reports that migrations 0001 and 0002 were already applied to the dedicated production D1. **Migrations 0003–0005 are pending remote application and validation.**
**Date:** 2026-11-03.
**User-created Cloudflare D1:** `chapterandsounds-book-db`.
**Database UUID:** `11535995-4a05-4770-9268-32f89d0b29bf`.
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

### First functional catalogue release (28 tables — executable candidate)

`works`, `work_titles`, `work_versions`, `editions`, `publication_events`, `audio_recordings`, `edition_recordings`, `people`, `person_names`, `contributions`, `organisations`, `publishers`, `imprints`, `series`, `series_memberships`, `identifier_schemes`, `entity_identifiers`, `media_assets`, `media_links`, `media_rights`, `metadata_licences`, `metadata_sources`, `source_records`, `field_claims`, `catalogue_audit_log`, `text_content`, `record_revisions`, `verification_reviews`.

Purpose: create a work, contributor, edition, audiobook recording, identifiers, cover and auditable source data. No blanket requirement to populate optional metadata, no fictional seed books.

### Extension modules (31 additional tables, now implemented as SQL migrations)

- Relationships and technical detail: `work_relationships`, `work_languages`, `edition_details`, `edition_relationships`, `edition_languages`, `audio_tracks`, `audio_recording_details`, `organisation_names`, `publisher_imprints`, `series_relationships`.
- Extended discoverability: `classification_schemes`, `subjects`, `work_subjects`, `content_advisories`, `audience_descriptors`, `descriptor_definitions`, `record_descriptors`.
- Media/distribution: `media_variants`, `territories`, `distribution_rights`, `product_offers`, `availability_events`.
- Ingestion/review/record lifecycle: `record_aliases`, `import_batches`, `import_errors`, `merge_events`, `editorial_overrides`.
- Future external API: `api_clients`, `api_keys`, `api_usage_daily`, `api_access_policies`.

**Updated:** `record_revisions`, `verification_reviews` and `text_content` have been moved into the 28-table executable staging candidate. The remaining 31 tables are now defined in new additive migrations; their corresponding features remain for later application development. All draft/publish transitions still require server-side atomic revision and rights checks before enabling writes.

**Migration sequence:** `0001_catalogue_core.sql` (15 tables), `0002_catalogue_metadata_media.sql` (13 tables), `0003_catalogue_relationships.sql` (10 tables), `0004_catalogue_discovery_distribution.sql` (12 tables), `0005_catalogue_import_api.sql` (9 tables). `npm run test:catalogue-schema` validates all five in isolated SQLite, asserting 28 tables after the first two and exactly 59 after the final migration. These additional tables do **not** activate public API access or import jobs.

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
      "database_id": "11535995-4a05-4770-9268-32f89d0b29bf",
      "migrations_dir": "catalogue-migrations"
    }
  ]
}
```

If using a separate Worker configuration instead, only bind `BOOK_DB` to that dedicated service and communicate via authenticated service bindings. This is preferred for the future external API and stronger isolation.

## Before applying extension migrations 0003–0005

1. Check `git pull origin main` and run `npm run test:catalogue-schema` locally; CI must pass.
2. Run `npx wrangler d1 migrations list BOOK_DB --remote` and verify **only** 0003, 0004 and 0005 are pending (if 0001/0002 unexpectedly pending, stop and investigate rather than assuming their presence).
3. Create a D1 backup/snapshot using the Cloudflare dashboard or a supported export workflow before production modifications.
4. Run `npx wrangler d1 migrations apply BOOK_DB --remote` once, confirming the target `chapterandsounds-book-db` with UUID `11535995-4a05-4770-9268-32f89d0b29bf`. Do not touch `DB`.
5. Verify `npx wrangler d1 migrations list BOOK_DB --remote` reports no pending migrations and `npx wrangler d1 execute BOOK_DB --remote --command "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations';"` returns 59. Cloudflare-managed migration/internal tables must be excluded from the count.
6. Do not rerun the old application migrations. Recheck the admin workbench; its existing functionality should continue to work unchanged.

**Operational boundary:** user reports original 28 tables deployed to BOOK_DB. The additional 31 tables are committed as pending migrations, but their remote application is not verified here. The existing application `DB` is untouched by this extension work. No R2 integration, bulk catalogue import or external API endpoint is enabled.
