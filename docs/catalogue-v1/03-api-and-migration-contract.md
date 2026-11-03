# Catalogue service API and migration contract — planning specification

**Status:** Draft v0.1, not implemented and not deployed.

## Service boundaries

**Application service:** owns accounts, permissions, sessions, reading progress, reviews, community, theme preferences and member requests.

**Catalogue service:** owns works, versions, editions, recordings, people, media relationships, classifications, identifiers, sources and catalogue audit. It must not store users' passwords, reading histories or private reviews.

**Transport:** authenticated server-to-server catalogue Worker for the Chapter & Sound app; future versioned external API exposed only after licence and operational reviews. Database engine can change without changing canonical IDs or REST contracts. No SQL joins across separate D1 databases; apply stable ID mapping and batched service lookups.

## Public read API (future)

| Method / route | Contract and safeguards |
|---|---|
| `GET /v1/works?query=&language=&subject=&cursor=&limit=` | Cursor-paged, server-filtered work search; no wholesale enumeration without entitlement |
| `GET /v1/works/{workId}` | Canonical work, contributor roles, descriptions permitted by source licences, completeness/status |
| `GET /v1/works/{workId}/editions` | Product-level editions, optional format/territory filters and cursor |
| `GET /v1/works/{workId}/recordings` | Distinct audio performances, not conflated by title |
| `GET /v1/editions/{editionId}` | Edition fields, permitted identifiers, cover media and recording references |
| `GET /v1/recordings/{recordingId}` | Narrators, runtime seconds/precision, audio production and track listings where rights allow |
| `GET /v1/people/{personId}` | One identity, named roles, linked works/recordings and approved portrait |
| `GET /v1/authors`, `GET /v1/narrators` | Role-filtered views over `people + contributions`, not duplicated identities |
| `GET /v1/series/{seriesId}` | Series details and ordered work memberships |
| `GET /v1/lookup/isbn/{isbn}` | ISBN normalization/checksum; return a matched edition or an ambiguity/unknown result |
| `GET /v1/lookup/asin/{asin}?market=` | ASIN lookup with provider/market scope |
| `GET /v1/changes?cursor=` | Entitlement-gated incremental change feed with deletions and rights withdrawal events |

**Response format:** `{data,meta:{schemaVersion,revision,provenanceSummary,rightsLevel},links}` for details, and `{items,nextCursor,meta}` for collections. Stable opaque IDs, published canonical aliases and no internal row-number assumptions. Return `null` for unknown fields, not guessed values. Optional `include=` expands, with limits to prevent N+1 amplification.

**Access controls:** external clients have scoped hashed keys and rights-aware field policies, rate limits, quotas, cache policy, export restrictions, attribution and takedown support. Never expose internal `field_claims` payloads or restricted source text by default.

## Administrator write API (future, private)

```text
POST   /internal/catalogue/works
GET    /internal/catalogue/works/{workId}/draft
PATCH  /internal/catalogue/works/{workId}
POST   /internal/catalogue/works/{workId}/review
POST   /internal/catalogue/works/{workId}/publish
POST   /internal/catalogue/editions
PATCH  /internal/catalogue/editions/{editionId}
POST   /internal/catalogue/recordings
PATCH  /internal/catalogue/recordings/{recordingId}
POST   /internal/catalogue/contributions
POST   /internal/catalogue/identifiers/check
POST   /internal/catalogue/media/uploads/initiate
POST   /internal/catalogue/media/uploads/{uploadId}/finalise
POST   /internal/catalogue/media/{assetId}/approve
POST   /internal/catalogue/media-links
POST   /internal/catalogue/merge-candidates
POST   /internal/catalogue/merges/{id}/approve
GET    /internal/catalogue/revisions/{entityType}/{entityId}
```

All write calls: verified owner/editor role, server-side field validation, CSRF/origin protections when browser cookies are involved, `Idempotency-Key` for creates/uploads, `If-Match` or `expectedRevision` for updates, actor and reason, audit trail. Errors: `400` bad field, `401` guest, `403` insufficient role/rights, `404` missing entity, `409` conflicting revision/duplicate, `422` publish prerequisites, `429` quota, `503` service unavailable. No false success.

### Work draft example (not a real record)

```json
{
  "canonicalTitle": "Example title",
  "workType": "book",
  "originalLanguage": null,
  "firstPublication": {"value": "1998", "precision": "year"},
  "contributions": [
    {"personId": "existing-catalogue-person-id", "roleCode": "author", "creditOrder": 1}
  ],
  "status": "draft"
}
```

### Edition and recording references

```json
{
  "workId": "existing-work-id",
  "format": "audiobook",
  "identifiers": [
    {"scheme": "ISBN13", "value": null},
    {"scheme": "ASIN", "value": null, "market": null}
  ],
  "recordingIds": ["existing-recording-id"],
  "primaryCoverAssetId": null,
  "publicationStatus": "draft"
}
```

No name/string is substituted for a validated ID when linking records. Uploads return approved `assetId` identifiers and link objects, not just untracked R2 URLs.

## Existing Chapter & Sound compatibility map

| Current source | New target | Migration invariant |
|---|---|---|
| `works.id` | `works.id` (new catalogue) | Crosswalk table maps every old work ID to the canonical new ID, including collision/merge resolution |
| `editions.id` | `editions.id` | Preserve exact published product identity and edition associations |
| `people.id` | `people.id` | Retain distinct people, aliases and contributor roles; no indiscriminate name matching |
| `work_contributors` | `contributions` with work target | Preserve role and ordering |
| `edition_contributors` | `contributions` with edition/recording target | Narrator attribution validated at recording level, not blindly propagated |
| `series`, `series_works` | `series`, `series_memberships` | Preserve sequence and labels |
| `images`, `edition_covers`, `person_portraits`, `image_assets` | `media_assets`, `media_links` | Preserve rights/credit and avoid overwriting existing image associations |
| `reading_experiences`, `reviews` | Remain in app DB | Keep all existing member ID / review references operational through ID lookup adapter |
| `favourite_people`, `curated_list_books`, `recommendations`, `club_reads` | Remain in app DB | Map referenced person/work IDs without data loss |
| `missing_book_requests` | Remain in app DB | Reference catalogue candidates by new optional ID, keep requester private |

**Migration mechanics:** add app DB `catalogue_id_mappings` only at migration time (old entity_kind/id, new catalog_id, mapping_status, confidence, verified_at) plus a durable outbox for reconciliation. Do not repurpose old FK columns to point at a separate D1 DB without redesign: SQLite foreign keys cannot reference another database through the Worker binding.

## Phased cutover gates

1. **Document approval**: field dictionary, identity rules, rights model and admin workflows agreed; no production writes.
2. **Engine benchmark**: representative number of works, editions, audio recordings, identifiers, FTS, provenance claims and query workloads. Record write/read cost, p95 latency and size, then commit engine decision.
3. **Standalone staging**: create dedicated catalogue database and R2 only after explicit approval; deploy read-only catalogue Worker and test migrations/ACLs.
4. **Populate source-of-truth**: import and dedupe authorised datasets; maintain traceable provenance and export permissions.
5. **Legacy mapping dry run**: count every legacy work/edition/person ref; identify ambiguous mappings; do not auto-delete or merge.
6. **Shadow read**: application queries both backends for controlled evaluation; log comparison without altering member data.
7. **Feature flag cutover**: route catalogue reads via service; keep account/review writes on app D1. Check all previously saved book links resolve.
8. **Rollback and reconciliation**: preserve legacy lookup path until API read parity and cross-device tests pass; cut over writes only after audited dual-write/outbox design if needed.
9. **Public API gate**: source licences, rate limits, terms, attribution, moderation and takedown proven, then limited developer beta.

## Architecture decision record — engine not chosen

As of 2026-11-03, Cloudflare D1 documents a maximum **10 GB per paid database** and **500 MB per free database**, with serial execution per database. For a potentially huge international bibliography, choose D1 only if a representative benchmark demonstrates feasible partitioning and query cost; otherwise choose managed PostgreSQL. Keep service contracts engine-agnostic. Reference: https://developers.cloudflare.com/d1/platform/limits/.

Cloudflare R2 can accept short-lived presigned direct PUT uploads, but these are bearer credentials and require authenticated server-side signing plus post-upload verification. Reference: https://developers.cloudflare.com/r2/api/s3/presigned-urls/.

BIC's digital audiobook guidance assumes ONIX 3.0/3.1 and Thema as its best-practice framework; see https://bic.org.uk/wp-content/uploads/2025/03/BIC_Digital-Audiobook-Metadata-Requirements-and-Accompanying-Notes-March-2025-v1.1.pdf.

## Open decisions required before v1.0 freeze

- Exact approved list of enum values and publication rules for every entity.
- Database engine after benchmarking and whether the 59-table proposed model needs consolidation.
- Source-by-source data retention, image rights and API redistribution permissions.
- Edit/review permission model and transactional audit implementation.
- Publishing/withdrawal policy, merge/unmerge recovery and catalogue freshness SLA.
- External API monetisation policy (deferred; do not assume permission to resell third-party data).
