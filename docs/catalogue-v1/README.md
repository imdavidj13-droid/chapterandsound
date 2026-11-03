# Dedicated Catalogue Architecture — Design Pack v0.1

**Planning only — no production database, Worker, R2 or website files were changed.**

This folder defines a standalone, API-capable book and audiobook catalogue for Chapter & Sound. It is a **review candidate**, not an executed database schema. Existing member data remains in `chapterandsound-db`.

## Documents

1. [01-table-registry.md](01-table-registry.md) — 59 proposed tables in 11 domains, minimum typed columns, key relationships, uniqueness/quality constraints and outstanding design decisions.
2. [02-admin-and-r2-workflows.md](02-admin-and-r2-workflows.md) — actual catalogue administration screens, work/edition/recording editors, draft versus publish requirements, optional metadata, secure R2 cover/portrait uploads, and error states.
3. [03-api-and-migration-contract.md](03-api-and-migration-contract.md) — future internal and public API contracts, role checks, ID crosswalk, compatibility with existing member records, shadow reads, rollback, licensing and performance decision gates.

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

## Freeze protocol

- v0.1 documents are committed for review. Names must **not** be quietly changed by implementation work.
- v1.0 is considered **locked** only after schema/engine/enum/permissions/licensing review and an explicit architecture approval. Record additions/deprecations in an ADR and changelog.
- Before implementation, create executable schema migrations and contract validation fixtures from the approved specification; have those checked independently for FK validity, duplicate policy, migration reversibility and prohibited information disclosure.
- The next implementation phase is component/service-contract scaffolding with **disabled unconnected actions**; no false local previews, fake book data or accidental live writes.
- Only after an agreed decision will the dedicated DB and R2 be provisioned, and only after that should the website be connected to those services.

## Recommended first architecture review

1. Confirm 59 tables versus any consolidation (especially organisations/publishers and version/edition relationships).
2. Agree the first-release editing modules: work, edition, recording, contributor, cover/R2, identifiers and verification queue.
3. Choose initial source families and rights/data-export rules.
4. Benchmark D1 against a realistic catalogue size before confirming database engine.
5. Sign off app DB ID migration and rollback plan.

**No data sources or credentials are included here.**
