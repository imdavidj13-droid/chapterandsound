# Dedicated Catalogue Architecture — Design Pack v0.2

**Staging-candidate SQL written and tested — no production tables, Worker bindings, R2 resources or website code were changed.** The user has created an empty dedicated D1 target, `chapterandsounds-book-db` (`961d5433-d7f8-4b8c-b84a-d9cad1a9a56a`). Its proposed binding is `BOOK_DB`.

This folder defines a standalone, API-capable book and audiobook catalogue for Chapter & Sound. It is a **review candidate**, not an executed database schema. Existing member data remains in `chapterandsound-db`.

## Documents

1. [01-table-registry.md](01-table-registry.md) — 59 proposed tables in 11 domains, minimum typed columns, key relationships, uniqueness/quality constraints and outstanding design decisions.
2. [02-admin-and-r2-workflows.md](02-admin-and-r2-workflows.md) — actual catalogue administration screens, work/edition/recording editors, draft versus publish requirements, optional metadata, secure R2 cover/portrait uploads, and error states.
3. [03-api-and-migration-contract.md](03-api-and-migration-contract.md) — future internal and public API contracts, role checks, ID crosswalk, compatibility with existing member records, shadow reads, rollback, licensing and performance decision gates.
4. [04-d1-deployment-and-phasing.md](04-d1-deployment-and-phasing.md) — actual catalogue D1 UUID and proposed `BOOK_DB` binding, separate migration path, first-release versus later domains, safety gates.
5. [05-validators-and-domain-contracts.md](05-validators-and-domain-contracts.md) — candidate enums, conditional mandatory fields, audiobook/contributor edge cases, media approval rules and concrete integrity tests.
6. [../../catalogue-migrations/0001_catalogue_core.sql](../../catalogue-migrations/0001_catalogue_core.sql) — executable staging-candidate core work, edition, recording, contributor and series schema (15 tables).
7. [../../catalogue-migrations/0002_catalogue_metadata_media.sql](../../catalogue-migrations/0002_catalogue_metadata_media.sql) — executable staging-candidate sources, identifiers, media, rights, text and audit schema (13 tables).

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

- The first-release candidate is now **28 tables**, of the 59 proposed catalogue tables. The remaining 31 are future modules.
- GitHub CI runs `npm run test:catalogue-schema` using disposable in-memory SQLite; it is **not** connected to either real D1 database.
- It checks FK integrity, work/version/edition consistency, audio recording association, author/narrator roles, identifier uniqueness, media approval/rights and audit storage.
- SQL remains a **candidate**, not a permanently frozen v1.0 schema. API-level identity and rights validations, staging D1 trial and migration review remain prerequisites for applying it to the new database.

## Freeze protocol

- v0.1 documents are committed for review. Names must **not** be quietly changed by implementation work.
- v1.0 is considered **locked** only after schema/engine/enum/permissions/licensing review and an explicit architecture approval. Record additions/deprecations in an ADR and changelog.
- Before implementation, create executable schema migrations and contract validation fixtures from the approved specification; have those checked independently for FK validity, duplicate policy, migration reversibility and prohibited information disclosure.
- The next implementation phase is component/service-contract scaffolding with **disabled unconnected actions**; no false local previews, fake book data or accidental live writes.
- The user has already provisioned the separate D1 database itself. Do not apply schema migrations or bind the site to it until the v1.0 schema, testing, rollback and authorisation model are approved. R2 remains unprovisioned for this feature.

## Recommended first architecture review

1. Review the 59 named tables, first-release grouping and any necessary consolidation (especially organisations/publishers and version/edition relationships).
2. Agree the first-release editing modules: work, edition, recording, contributor, cover/R2, identifiers and verification queue.
3. Choose initial source families and rights/data-export rules.
4. Benchmark D1 against a realistic catalogue size before confirming database engine.
5. Sign off app DB ID migration and rollback plan.

**No data sources or credentials are included here.**
