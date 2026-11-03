# Catalogue administration — screen and workflow specification

**Status:** Proposed v0.1 — documentation only. No UI, migrations, Worker routes, R2 buckets or live data changed.

## Product principles

1. A `work` is a literary creation; its `edition` is an actual published product; an `audio_recording` is a performed audio rendition. A cover normally belongs to an edition; a work may separately select a representative cover.
2. Every editor operates on **real persisted catalogue data only** once the API exists. Before then, unfinished controls are explicitly disabled, not filled with fake books or simulated saved states.
3. Save a minimally identified **private draft**, revisit it later; publish only after appropriate validation and provenance. Missing optional metadata is allowed and displayed as unknown.
4. Navigation between work, edition, recording, person, series and media uses stable IDs. Names and numbers are never the relational key.
5. Validate all server-side; return field-specific errors; never claim success until the database confirms. Show unsaved-change warnings; an offline form remains unsaved, not disguised as a synced draft.
6. Use server-side revisions / ETags or `updated_at` compare-and-swap to avoid overwriting concurrent edits.
7. Restrict all editorial writes by verified administrator role; granular catalogue-editor privileges may follow later. Rights-gated public reads do not imply edit permission.
8. Maintain immutable revisions and audit records for creates, updates, merges, review decisions, media approvals and publication.

## Administration navigation and information architecture

| Route proposal | View | Actions / constraints |
|---|---|---|
| `/admin/catalogue` | Catalogue overview | Counts by work/edition/recording/status; import health, issues and pending requests |
| `/admin/catalogue/works` | Work list | Search by title/contributor/IDs; filter by status and missing fields; create work |
| `/admin/catalogue/works/new` | Work editor | Save incomplete draft; search/add author(s); add text/subjects; link versions; choose representative art |
| `/admin/catalogue/works/:id` | Work detail | Tabs: details, contributors, versions, series, editions, audio, identifiers, assets, sources, history |
| `/admin/catalogue/editions/new` | Edition editor | Required existing work; product format; ISBN/ASIN checks; cover upload and rights review |
| `/admin/catalogue/editions/:id` | Edition editor | Physical/digital specification, product identifiers, publishing/reprint events, approved cover(s) |
| `/admin/catalogue/recordings/new` | Recording editor | Link work/version, distinct narrators, runtime in hours/minutes/seconds, abridgement and track data |
| `/admin/catalogue/recordings/:id` | Recording detail | Track list, performers, production, audio technical metadata, linked releases |
| `/admin/catalogue/people` | Contributors | Single canonical person; filter Author/Narrator/Translator/Other; aliases and role-scoped works |
| `/admin/catalogue/series` | Series | Parent/child series, numbered/orderable memberships, derived bibliography |
| `/admin/catalogue/media` | Media library | R2 uploads, rights evidence, derivative variants, approvals and reuse |
| `/admin/catalogue/quality` | Review queue | Conflicts, duplicates, low-confidence claims, source-rights blocks, unverified records |
| `/admin/catalogue/imports` | Import control | Provider policies, dry-run, manifests, progress, rejected records and retriable batches |
| `/admin/catalogue/history` | Audit | Who/what/when/source, before/after, reversible operations where supported |
| `/admin/catalogue/api` | Future API administration | Client registration, API scopes, quotas, usage and takedowns; not active until approved |

## Work editor — field groups

**Quick save (private draft):** canonical title (required), work type (default `book`), optional author(s), language, original publication year/date, draft source note. System generates work ID and timestamps. Duplicate detection warns before final submit; lack of author does not prevent an unidentified draft.

**Overview:** canonical title, subtitle, alternate titles (type/language/territory), synopsis, work type, original-language title, original language, release-date precision, other languages, status and reviewer comments.

**Contributors:** searchable reusable people; create new provisional person; role, credit order, credited name and provenance. Never automatically treat a narrator as an author.

**Versions and relationships:** translation, revised, abridged, omnibus and adaptation links; cycle detection for work relationships; no implied merging.

**Series:** membership, type, fractional or textual displayed number, reading/publishing order where known.

**Discoverability:** Thema/BISAC (scheme and version), genre, audience, advisory, themes, mood, pacing, setting, literary devices, awards with sourced evidence. Subjective descriptors always carry source or editorial attribution.

**Media:** optionally choose an approved representative cover. The work cover is a convenience, not an edition's ISBN-specific jacket.

**Sources:** source claims, provenance, verification state, licence, reviewer and last checked.

## Edition editor — conditional fields

Mandatory to save: linked work and format. For publication, also require an edition identity or sufficient identifying evidence to distinguish it from existing editions, plus publication rights/provenance state. ISBN is optional because some products lack one.

- General: version, product title, subtitle, edition statement, imprint, publisher, country, publication events, language, market availability.
- Physical: paperback/hardback/binding, pages, dimensions, weight, illustration counts.
- Digital: file format, file size, DRM and accessibility classifications if provided.
- Product identifiers: ISBN-13 (checksum validation), historical ISBN-10, ASIN (issuer/market scope), publisher's own product code; avoid treating ISBN and ASIN as equivalents.
- Covers: edition-level approved front cover, alternate jacket and back cover where rights permit.
- Audio format: link one or more `audio_recordings`; narration, track metadata and duration are edited on the recording, not silently copied to the work.
- Provenance: every material field can show source assertions and curator override.

## Audio recording editor — conditional fields

Mandatory to save: linked work/version, recording status and meaningful identifying source or editorial claim. It may initially have no duration or narrator.

- Performance: unabridged/abridged/unknown; single voice, multiple narrators, full cast, dramatisation.
- People: narrator(s), cast, producer, director, studio, performance-language/credited names and ordered credits.
- Length: integer seconds, precision (exact, rounded, approximate, unknown), original runtime source, optional track/chapter timings.
- Technical: codec, sample rate, channels, bitrate and remaster version if known.
- Release: which `editions` use this recording, separate IDs/cover/availability for each product.
- A narrator switching, a substantive abridgement or remade performance should not automatically overwrite the existing recording; propose a separate recording identity, then link to the same work.

## R2 media-upload lifecycle

```text
Select local file
  -> Request short-lived upload permission (admin session)
  -> Upload to restricted R2 staging prefix
  -> Server validates bytes, MIME signature, size, dimensions and hash
  -> Check rights/credit/source declaration and malware/content policy as appropriate
  -> Generate approved derivatives; record each in media_variants
  -> Mark media_assets approved or quarantine/reject
  -> Attach via media_links to edition/work/person/etc
  -> Publish through controlled media delivery with cache headers
```

**Proposed buckets/prefixes:** separate `catalogue-media` bucket with `staging/`, `approved/original/`, `approved/derived/`, and `quarantine/`; consider separate buckets if permissions and retention policies demand it. Do not create one now. Use opaque content-addressed keys with no personal data or ISBN-dependent names; original filenames are metadata only.

- Only authenticated authorised editors may initiate upload or attach an asset.
- Upload max dimensions and file size are policy constants; decide after sampling actual cover files. Image transcoding should be bounded. No SVG/HTML active content served from uploads; strict MIME and response headers.
- `media_assets` owns storage state; `media_links` owns relationships. Do not store raw image bytes in D1.
- R2 upload + D1 commit are not atomic: use staged states, idempotency tokens, compensation jobs, and periodic orphan sweeps.
- Original or derivative removals are delayed until no approved links/revision retention require them.
- Images with unverified/denied rights remain private. **An ISBN/ASIN match does not establish the right to distribute its cover in an external API.**
- Avoid double uploads via hash lookup. A single media asset may link to multiple records when licensing permits.
- Image URL in APIs is a signed or controlled delivery URL according to rights; don't treat R2 object keys as public URLs.

## Required validation and save transitions

```text
draft -> needs_review -> verified -> published
  |          |             |
  +----------+-------------+--> withdrawn / suppressed
```

`verified` confirms bibliographic checks; `published` separately confirms current public-display eligibility and rights. A metadata claim can be accepted while its image remains restricted. All transitions need audit reason, actor and revision. For withdrawn rights, immediately suppress affected fields/assets and invalidate API caches.

**Draft error states:** duplicate candidate (block or explicit reviewed override), source/licence missing, invalid ISBN, unsupported format, bad recording relationship, invalid person credit, failed asset scan, concurrent edit conflict, remote API offline, and incomplete publish requirements.

## Component contract plan (build before database)

`CatalogueWorkbench`, `WorkEditor`, `EditionEditor`, `AudioRecordingEditor`, `ContributorPicker`, `SeriesPicker`, `IdentifierEditor`, `ProvenancePanel`, `SubjectPicker`, `MediaUploader`, `MediaLibraryPicker`, `RightsEditor`, `VerificationQueue`, `AuditTimeline`.

These components accept typed API DTOs and operate through an injected catalogue service client. Until backend implementation, show an explicit not-connected/disabled state. No mock data in the production application; isolated test fixtures are permitted only in tests/storybooks.

## Definition of done for each editor

- Create, revisit, update, validate and publish against the **real dedicated catalogue service**.
- Handles no data, partial drafts, matching duplicates, and concurrent revisions without data loss.
- Proves author/narrator role separation and multiple edition/recording examples.
- Supports full keyboard access, mobile-sized admin screens and upload failure recovery.
- Saves immutable audit, source and rights claims; private fields never leak to public endpoints.
- Works through Chapter & Sound after ID-mapping cutover, without breaking existing member reviews/reading histories.
