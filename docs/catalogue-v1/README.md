# Dedicated Catalogue Architecture — Complete 59-table schema v0.3

**Five migrations now define the complete 59-table structure.** The user reports migrations 0001–0002 were applied remotely; migrations 0003–0005 have been committed and tested but not applied to production. The dedicated D1 target is `chapterandsounds-book-db` (`11535995-4a05-4770-9268-32f89d0b29bf`). Its proposed binding is `BOOK_DB`.

This folder defines a standalone, API-capable book and audiobook catalogue for Chapter & Sound. Its extension schema has passed isolated SQLite checks and GitHub CI; final rights/API/application integration work remains. Existing member data remains in `chapterandsound-db`.

## Documents

1. [01-table-registry.md](01-table-registry.md) — 59 proposed tables in 11 domains, minimum typed columns, key relationships, uniqueness/quality constraints and outstanding design decisions.
2. [02-admin-and-r2-workflows.md](02-admin-and-r2-workflows.md) — actual catalogue administration screens, work/edition/recording editors, draft versus publish requirements, optional metadata, secure R2 cover/portrait uploads, and error states.
3. [03-api-and-migration-contract.md](03-api-and-migration-contract.md) — future internal and public API contracts, role checks, ID crosswalk, compatibility with existing member records, shadow reads, rollback, licensing and performance decision gates.
4. [04-d1-deployment-and-phasing.md](04-d1-deployment-and-phasing.md) — actual catalogue D1 UUID and proposed `BOOK_DB` binding, separate migration path, first-release versus later domains, safety gates.
5. [05-validators-and-domain-contracts.md](05-validators-and-domain-contracts.md) — candidate enums, conditional mandatory fields, audiobook/contributor edge cases, media approval rules and concrete integrity tests.
6. [../../catalogue-migrations/0001_catalogue_core.sql](../../catalogue-migrations/0001_catalogue_core.sql) — executable staging-candidate core work, edition, recording, contributor and series schema (15 tables).
7. [../../catalogue-migrations/0002_catalogue_metadata_media.sql](../../catalogue-migrations/0002_catalogue_metadata_media.sql) — sources, identifiers, media, rights, text and audit schema (13 tables).
8. [../../catalogue-migrations/0003_catalogue_relationships.sql](../../catalogue-migrations/0003_catalogue_relationships.sql) — relationships, edition details, audiobook tracks, organisations and series (10 additional tables).
9. [../../catalogue-migrations/0004_catalogue_discovery_distribution.sql](../../catalogue-migrations/0004_catalogue_discovery_distribution.sql) — classifications, descriptive subjects, image variants, availability and territorial distribution (12 additional tables).
10. [../../catalogue-migrations/0005_catalogue_import_api.sql](../../catalogue-migrations/0005_catalogue_import_api.sql) — imports, merge history, editorial overrides and future API client governance (9 additional tables).

## Agreed underlying design

- **One underlying work** identified by a stable work/book ID; separate product editions and distinct audio recordings.
- **One canonical person identity** irrespective of author, narrator or translator role; roles attached to the credited object.
- **Covers normally belong to editions**, with optional representative work artwork. Approved media objects live in R2, linked by D1 metadata and rights.
- **Private account data stays in the app database**; catalogue contains works, products, recordings and bibliographic identities only.
- Every optional field can remain unknown; missing values are not hallucinated. Drafts need very little metadata; publication requires verification and sufficient source/rights evidence.
- Independent catalogue service is the first consumer; public third-party API is deferred until legal/operational readiness.

## Naming glossary

| Reader-facing term | Internal technical term |
|---|---|
| Book | `works` row |
| Book ID | `works.id` / `work_id` reference |
| Book edition | `editions` / `edition_id` |
| Audiobook recording | `audio_recordings` / `recording_id` |
| Author | `people` + `contributions.role_code='author'` |
| Narrator | `people` + `contributions.role_code='narrator'` |
| Book cover | R2 `media_assets` + `media_links` to edition/work |
| ISBN / ASIN | Namespaced `entity_identifiers`, not canonical IDs |
| Metadata source | `metadata_sources` / `source_records` / `field_claims` |
| Administrator history | `record_revisions`, `catalogue_audit_log` |

## Validation completed

- All **59 canonical tables** are now defined: 28 in the originally applied migrations and 31 additional in the three new migrations.
- GitHub CI runs `npm run test:catalogue-schema` using disposable in-memory SQLite; it is **not** connected to either real D1 database.
- It checks 15→28→38→50→59 incremental table counts plus FK integrity, work/version/edition consistency, audio recording association, author/narrator roles, identifier uniqueness, classification, R2 media approval/rights, imports, merge aliases, API access metadata and audit storage.
- SQL passed isolated SQLite checks, **not a live Cloudflare D1 migration**. Further API-level identity and rights validations, staging D1 trial and review remain needed before treating this as a complete public catalogue system.

## Freeze protocol

- v0.3 documents are committed for review. Names must **not** be quietly changed by implementation work.
- v1.0 is considered **locked** only after schema/engine/enum/permissions/licensing review and an explicit architecture approval. Record additions/deprecations in an ADR and changelog.
- Before implementation, create executable schema migrations and contract validation fixtures from the approved specification; have those checked independently for FK validity, duplicate policy, migration reversibility and prohibited information disclosure.
- The next implementation phase is component/service-contract scaffolding with **disabled unconnected actions**; no false local previews, fake book data or accidental live writes.
- The user has already provisioned the separate D1 database and reports the original 28 tables are installed. Follow the explicit checks and extension steps in [04-d1-deployment-and-phasing.md](04-d1-deployment-and-phasing.md), including verifying only 0003–0005 remain pending. R2 remains unprovisioned for this feature.

## Recommended first architecture review

1. Review the 59 named tables, first-release grouping and any necessary consolidation (especially organisations/publishers and version/edition relationships).
2. Agree the first-release editing modules: work, edition, recording, contributor, cover/R2, identifiers and verification queue.
3. Choose initial source families and rights/data-export rules.
4. Benchmark D1 against a realistic catalogue size before confirming database engine.
5. Sign off app DB ID migration and rollback plan.

**No data sources or credentials are included here.**
