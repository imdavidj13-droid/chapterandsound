# Catalogue v0.2 — Domain contracts, validations and publication rules

**Design-only specification.** These are candidate controlled values and validation rules. They apply to the catalogue's dedicated database and are **not** new application behaviour until implemented and approved.

## Identity and relationship contract

| Entity | Reader-facing meaning | Required draft attributes | Evidence before publication |
|---|---|---|---|
| `works` | Underlying book/story | `id`, `canonical_title`, `work_type`, `status=draft` | Confirmed identifying information; author credit when known; sourced identity and no unresolved likely duplicate |
| `work_versions` | Translation, abridgement or substantive textual revision | `id`, `work_id`, version type | Valid source version where required; translator/editors correctly scoped |
| `editions` | One published product | `id`, `work_id`, format, `publication_status=draft` | Distinguishable product/edition, publication info where obtainable, source evidence and required rights checks |
| `audio_recordings` | One performed audio rendition | `id`, `work_id`, abridgement/performance type (unknown accepted) | Distinguishable recording and source; narrator/duration can remain undisclosed when genuinely unknown |
| `people` | One individual identity | `id`, `preferred_name`, status | Source-backed attribution; aliases are separate name records |
| `contributions` | Contributor on a specific entity | One contributor subject, one target, one role, order | No impossible role-target combination; no automatic roles copied between work and recording |
| `media_assets` | Approved upload / derived asset | `id`, staging R2 key, hash, MIME, size, status | Rights evidence, file validation and successful upload verification |
| `media_links` | Which entity displays the asset | `id`, approved asset ID, typed target ID, role | Asset approved and link role allowed for target type |
| `entity_identifiers` | Source-specific identifier | scheme, entity scope, normalized identifier | Valid syntax and issuer/territory scope, resolving ambiguity rather than discarding conflicting claims |

## Candidate enums to freeze in v1.0

| Column or domain | Allowed values |
|---|---|
| `works.work_type` | `book`, `short_story`, `collection`, `graphic_novel`, `comic`, `poetry`, `play`, `reference`, `other` |
| Cataloguing workflow `status` | `draft`, `needs_review`, `verified`, `published`, `withdrawn`, `suppressed` |
| `editions.format` | `paperback`, `hardback`, `ebook`, `audiobook`, `audio_cd`, `other_print`, `other_digital`, `unknown` |
| `publication_events.event_type` | `announced`, `preorder`, `released`, `reprinted`, `revised`, `withdrawn`, `out_of_print` |
| `work_versions.version_type` | `original`, `translation`, `revision`, `abridgement`, `adaptation`, `annotated`, `other` |
| `audio_recordings.abridgement` | `unabridged`, `abridged`, `adapted`, `unknown` |
| `audio_recordings.performance_type` | `single_narrator`, `multi_narrator`, `full_cast`, `dramatised`, `synthetic_voice`, `unknown` |
| `audio_recordings.duration_precision` | `exact`, `rounded`, `approximate`, `unknown` |
| `people.identity_status` | `provisional`, `verified`, `disambiguation_required`, `merged`, `suppressed` |
| `contributions.role_code` | `author`, `coauthor`, `narrator`, `cast`, `translator`, `editor`, `illustrator`, `cover_artist`, `foreword`, `afterword`, `adapter`, `producer`, `director`, `audio_engineer`, `other` |
| `media_assets.state` | `staging`, `uploaded`, `scanning`, `pending_rights`, `approved`, `quarantined`, `rejected`, `retired` |
| `media_links.role` | `front_cover`, `back_cover`, `representative_cover`, `portrait`, `publisher_logo`, `sample_artwork`, `other` |
| `field_claims` source-confidence | `unverified`, `source_claimed`, `corroborated`, `editor_verified`, `disputed` (derived claim status; scoring scheme to be decided) |
| Source reuse policy | `private_only`, `internal_display`, `public_display`, `public_api_redistributable` (capability-based; actual source licence still authoritative) |

**Deliberately not frozen:** final exhaustive ONIX role codes and subject taxonomy codes. Store standards-based identifiers in controlled scheme tables rather than hardcode one enormous custom enum; map shorthand UI codes to canonical scheme definitions.

## Conditional validation matrix

| Scenario | Draft permitted? | Publish requirements |
|---|---|---|
| Work title known, author unknown | Yes | May remain in review; never invent author; allow approved anonymous/unknown creator if source genuinely supports it |
| Edition has no ISBN | Yes | Yes, if a product without ISBN is corroborated using other identifiers and publication evidence |
| Audiobook has no runtime | Yes | Yes when runtime is genuinely unavailable and sufficient recording identity exists; display `Runtime unavailable` |
| Audiobook has several narrators | Yes | Ordered multiple `contributions`, not a comma-separated narrator string |
| One recording distributed by two retailers | Yes | One `audio_recordings` with two distinct `editions`/offers if products differ; validate identity evidence |
| New cover uploaded but usage permission unconfirmed | Yes | Keep asset private and not displayable; metadata record may publish without a cover |
| Conflicting page counts from sources | Yes | Associate with correct edition; otherwise flag claim conflict; do not overwrite silently |
| ISBN looks similar to another book | Yes | Validate check digit and scope; resolve duplicates before publishing |
| Same title used by two different works | Yes | Do not merge on title alone |
| A contributor is both author and narrator | Yes | One `people` row with separate work and recording `contributions` |

## Explicit field behaviour

- **Required at creation** means only enough to save a real draft. `id`, timestamps and revision are generated server side; editor cannot supply arbitrary primary IDs for ordinary create operations.
- **Nullable** is different from zero, false, blank string and not applicable. Validation rejects empty whitespace for title/name but keeps unknown optional properties as NULL.
- **Language** uses validated BCP 47 tags. A country of publication is not a language.
- **Dates** support year-only and month-only precision; never turn `1999` into an invented `1999-01-01` in a visible record.
- **Page counts** are strictly positive if supplied, tied to an edition, and carry method/source where available. Printed and ebook pagination can differ.
- **Runtime** is non-negative integer seconds; a zero runtime is not a substitute for unknown. Per-track totals can differ from a publisher's rounded duration and should be separately sourced.
- **ISBN-13** is normalized with a valid checksum and stored as 13-character text. Old ISBN-10 values can be stored with their own identifier scheme and validation.
- **ASIN** is opaque text, with provider/market scope, not an ISBN and not a guaranteed globally unique key.
- **Authors/narrators** are role-scoped links to `people`; aliases and credited names do not create duplicate person rows automatically.
- **Descriptions, excerpts and sample clips** require source-specific storage/display/API permissions. Storage rights and redistribution rights are separate booleans/policies.
- **Audiobook synthetic voices** must be explicitly labelled where reliable source data supports it. Do not infer from narration style.
- **User-generated ratings** stay in application D1, never copied as canonical bibliographic facts.

## Integrity tests required before creating schema

1. Inserting a contribution without a person or organisation fails.
2. Inserting a contribution with two target IDs fails.
3. A recording can have multiple narrators; one person can write and narrate.
4. An edition from work A cannot accidentally link to work B's recording without a deliberate reviewed omnibus/product relationship.
5. ISBN checksum failures and duplicate namespace IDs are rejected or quarantined for review.
6. A source-restricted cover cannot acquire a public API URL.
7. An approved edition may have no cover; an uploaded cover may not auto-approve itself.
8. Concurrent edits on the same revision produce a conflict instead of overwriting each other.
9. A withdrawn book may not remain in public search or API results after cache invalidation.
10. Work/edition merge never destroys old IDs or breaks existing member reading/review references.

## Remaining schema-review blockers

- Some table definitions currently use generic polymorphic entity links and cross-table lifecycle dependencies. Implement concrete FK/trigger checks or a validated entity registry before executing SQL.
- First-release set must include version/audit and description tables if the first UI promises saved revisions or rich summaries.
- Decide physical indexing (title/author FTS, ISBN lookup, record revision) based on representative D1 query tests rather than guessing.
- Decide treatment of boxed sets containing multiple works and multi-part audio releases before production ingestion.
- Choose exactly how a standalone catalogue Worker verifies app-admin credentials without sharing login secrets or granting direct anonymous writes.
