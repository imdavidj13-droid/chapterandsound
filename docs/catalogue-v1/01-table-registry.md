# Chapter & Sound Catalogue — Canonical Table Registry and Field Dictionary

**Status:** Proposed schema v0.1 (review candidate; NOT deployed, NOT yet frozen).  
**Scope:** Standalone bibliographic catalogue database. No accounts, member reviews, private reading data or authentication sessions.  
**Date:** 2026-11-03.  
**Current database:** remains unchanged.

## Data conventions

- Table names use plural `snake_case`; PKs are stable opaque UUID strings (`id TEXT PRIMARY KEY` in D1), except natural keys and documented composite keys.
- `!` means required; `?` nullable. `fk X` means a real FK **within the catalogue database**. `enum` means an explicitly documented controlled vocabulary, never arbitrary free text. `partial_date` is a validated string representing `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, accompanied by an optional precision/source qualifier where needed.
- `bcp47`, `iso3166`, `iso4217`, `iso15924`: standardised language, country, currency and script codes respectively. `json` is validated JSON text on D1; `boolean` is integer 0/1; `timestamp` is ISO 8601 UTC text; `decimal` must have documented scale, not binary float for high-precision identifiers or money.
- Every entity uses created/updated timestamps and origin/revision where meaningful. Audit and source-revision records are append-only. Optional fields remain NULL when unknown—not fabricated defaults.
- Cross-database identifiers (`actor_external_id`, application `work_id` references) are **not SQL foreign keys**. The catalogue API resolves them, and migration maps old IDs to new IDs.
- Polymorphic `entity_kind/entity_id` pairs cannot have ordinary SQL FKs. They require an explicit allowlist, application validation, consistency scans, and deletion restrictions. Prefer typed join tables for hot paths.
- `contributions` must have **exactly one** credited subject (`person_id` or `organisation_id`) and exactly one target (`work_id`, `version_id`, `edition_id`, `recording_id`). CHECK constraints enforce this. Role codes are controlled; one person can hold multiple scoped roles.
- `editions.format` describes a published product. `audio_recordings` describes its performed recording; `edition_recordings` supports reuse and multi-volume products. Audio narration is attached through `contributions` targeting the recording.
- No duplicated published ISBN-13 in the same authoritative identifier namespace. ASIN uniqueness must be scoped to its issuing market/provider; conflicting claims are held in provenance, not silently collapsed.
- Field-level rights and API export eligibility are enforced before returning any content or image externally.

## Proposed table registry and minimum field dictionary

**Total: 59 tables across 11 domains.** Each row lists the identity and domain-specific columns; common timestamps, status, source and audit policies apply as specified above. These are not executable SQL migrations.

### Works and versions

| Table | Purpose | Core columns / types |
|---|---|---|
| `works` | Canonical intellectual work | `id:uuid!`; `canonical_title:text!`; `original_language:bcp47?`; `work_type:enum!`; `first_publication_date:partial_date?`; `status:enum!`; `created_at:timestamp!`; `updated_at:timestamp!` |
| `work_titles` | Alternative, translated and regional titles | `id:uuid!`; `work_id:fk works!`; `title:text!`; `subtitle:text?`; `title_type:enum!`; `language:bcp47?`; `territory:iso3166?`; `source_claim_id:fk field_claims?` |
| `work_versions` | Translations, revisions and abridged textual versions | `id:uuid!`; `work_id:fk works!`; `version_type:enum!`; `title:text?`; `language:bcp47?`; `source_version_id:fk work_versions?`; `date:partial_date?`; `notes:text?` |
| `work_relationships` | Adaptations, sequels, compilations and components | `id:uuid!`; `from_work_id:fk works!`; `to_work_id:fk works!`; `relation_type:enum!`; `ordinal:integer?`; `notes:text?` |
| `work_languages` | Original and additional language claims | `id:uuid!`; `work_id:fk works!`; `language:bcp47!`; `relationship:enum!`; `source_claim_id:fk field_claims?` |

### Editions and publication

| Table | Purpose | Core columns / types |
|---|---|---|
| `editions` | Specific published product manifestations | `id:uuid!`; `work_id:fk works!`; `version_id:fk work_versions?`; `format:enum!`; `edition_statement:text?`; `title_override:text?`; `language:bcp47?`; `page_count:integer?`; `page_count_type:enum?`; `publication_status:enum!`; `verification_status:enum!`; `created_at:timestamp!`; `updated_at:timestamp!` |
| `edition_details` | Physical and technical edition characteristics | `edition_id:fk editions pk!`; `binding:text?`; `trim_height_mm:decimal?`; `trim_width_mm:decimal?`; `thickness_mm:decimal?`; `weight_g:decimal?`; `illustration_count:integer?`; `file_format:text?`; `file_size_bytes:integer?`; `technical_json:json?` |
| `publication_events` | Announcements, releases, reprints, withdrawals | `id:uuid!`; `edition_id:fk editions!`; `event_type:enum!`; `date_value:partial_date?`; `territory:iso3166?`; `publisher_id:fk publishers?`; `imprint_id:fk imprints?`; `source_claim_id:fk field_claims?` |
| `edition_relationships` | Replacements and related products | `id:uuid!`; `edition_id:fk editions!`; `related_edition_id:fk editions!`; `relation_type:enum!`; `notes:text?` |
| `edition_languages` | Original/parallel/translated edition languages | `edition_id:fk editions!`; `language:bcp47!`; `usage:enum!`; `source_claim_id:fk field_claims?` |

### Audiobook recordings

| Table | Purpose | Core columns / types |
|---|---|---|
| `audio_recordings` | Unique performed/produced audio rendition | `id:uuid!`; `work_id:fk works!`; `version_id:fk work_versions?`; `recording_title:text?`; `language:bcp47?`; `abridgement:enum!`; `performance_type:enum!`; `duration_seconds:integer?`; `duration_precision:enum?`; `recorded_date:partial_date?`; `master_version:text?`; `verification_status:enum!`; `created_at:timestamp!`; `updated_at:timestamp!` |
| `audio_tracks` | Optional track and chapter sequence | `id:uuid!`; `recording_id:fk audio_recordings!`; `sequence:integer!`; `title:text?`; `duration_seconds:integer?`; `start_offset_seconds:integer?`; `track_type:enum?` |
| `audio_recording_details` | Audio-specific technical characteristics | `recording_id:fk audio_recordings pk!`; `studio_id:fk organisations?`; `channels:integer?`; `sample_rate_hz:integer?`; `bitrate_kbps:integer?`; `audio_codec:text?`; `production_notes:text?`; `includes_music:boolean?`; `sound_effects:boolean?` |
| `edition_recordings` | Which published products contain which recording(s) | `edition_id:fk editions!`; `recording_id:fk audio_recordings!`; `sequence:integer!`; `primary_recording:boolean!`; `PRIMARY KEY(edition_id`; `recording_id)` |

### People and publishing organisations

| Table | Purpose | Core columns / types |
|---|---|---|
| `people` | One identity per contributor across all roles | `id:uuid!`; `preferred_name:text!`; `sort_name:text?`; `bio:text?`; `birth_date:partial_date?`; `death_date:partial_date?`; `identity_status:enum!`; `created_at:timestamp!`; `updated_at:timestamp!` |
| `person_names` | Pseudonyms and credited/transliterated names | `id:uuid!`; `person_id:fk people!`; `name:text!`; `name_type:enum!`; `language:bcp47?`; `script:iso15924?`; `is_public:boolean!` |
| `contributions` | Scoped credited work of a person or organisation | `id:uuid!`; `person_id:fk people?`; `organisation_id:fk organisations?`; `work_id:fk works?`; `version_id:fk work_versions?`; `edition_id:fk editions?`; `recording_id:fk audio_recordings?`; `role_code:enum!`; `credit_name:text?`; `credit_order:integer!`; `notes:text?` |
| `organisations` | Studios, agencies, rights holders and other organisations | `id:uuid!`; `name:text!`; `organisation_type:enum!`; `country:iso3166?`; `website_url:url?`; `created_at:timestamp!`; `updated_at:timestamp!` |
| `organisation_names` | Historical and alternative organisation names | `id:uuid!`; `organisation_id:fk organisations!`; `name:text!`; `valid_from:partial_date?`; `valid_to:partial_date?`; `name_type:enum!` |
| `publishers` | Publisher-specific profile (organisation subtype) | `organisation_id:fk organisations pk!`; `primary_market:iso3166?`; `publisher_notes:text?` |
| `imprints` | Publishing imprints and brands | `id:uuid!`; `name:text!`; `publisher_id:fk publishers?`; `website_url:url?`; `created_at:timestamp!` |
| `publisher_imprints` | Historical publisher-imprint links | `publisher_id:fk publishers!`; `imprint_id:fk imprints!`; `valid_from:partial_date?`; `valid_to:partial_date?`; `PRIMARY KEY(publisher_id`; `imprint_id`; `valid_from)` |

### Series

| Table | Purpose | Core columns / types |
|---|---|---|
| `series` | Named series or collection | `id:uuid!`; `title:text!`; `description:text?`; `series_type:enum!`; `created_at:timestamp!`; `updated_at:timestamp!` |
| `series_memberships` | Work position and numbering in series | `id:uuid!`; `series_id:fk series!`; `work_id:fk works!`; `sequence_decimal:decimal?`; `display_number:text?`; `membership_type:enum!`; `source_claim_id:fk field_claims?` |
| `series_relationships` | Parent series, subseries, shared-universe relationships | `parent_series_id:fk series!`; `child_series_id:fk series!`; `relation_type:enum!`; `PRIMARY KEY(parent_series_id`; `child_series_id`; `relation_type)` |

### Identifiers and aliases

| Table | Purpose | Core columns / types |
|---|---|---|
| `identifier_schemes` | Namespaced identifier definitions and validation | `id:uuid!`; `code:text!`; `issuer:text?`; `entity_scope:enum!`; `uniqueness_scope:enum!`; `validator_code:text?`; `public_lookup:boolean!` |
| `entity_identifiers` | ISBN, ASIN, OL, Wikidata, ISNI and other IDs | `id:uuid!`; `scheme_id:fk identifier_schemes!`; `entity_kind:enum!`; `entity_id:uuid!`; `value:text!`; `normalized_value:text!`; `issuer_scope:text?`; `market_scope:text?`; `is_primary:boolean!`; `status:enum!`; `source_record_id:fk source_records?` |
| `record_aliases` | Redirects for merged/retired record IDs | `id:uuid!`; `entity_kind:enum!`; `obsolete_id:uuid!`; `canonical_id:uuid!`; `merge_event_id:fk merge_events?`; `created_at:timestamp!` |

### Classifications and descriptors

| Table | Purpose | Core columns / types |
|---|---|---|
| `classification_schemes` | Thema, BISAC and other controlled vocabularies | `id:uuid!`; `scheme_code:text!`; `version:text!`; `licence_policy_id:fk metadata_licences?` |
| `subjects` | Subject and genre taxonomy nodes | `id:uuid!`; `scheme_id:fk classification_schemes!`; `code:text!`; `label:text!`; `parent_subject_id:fk subjects?` |
| `work_subjects` | Evidence-based genre/subject assignments | `id:uuid!`; `work_id:fk works!`; `subject_id:fk subjects!`; `primary_flag:boolean!`; `source_claim_id:fk field_claims?` |
| `content_advisories` | Content advisories with confidence and scope | `id:uuid!`; `work_id:fk works?`; `version_id:fk work_versions?`; `advisory_code:text!`; `severity:enum?`; `details:text?`; `source_claim_id:fk field_claims?` |
| `audience_descriptors` | Audience age, reading level, education and region | `id:uuid!`; `work_id:fk works?`; `edition_id:fk editions?`; `descriptor_code:text!`; `minimum_age:integer?`; `maximum_age:integer?`; `source_claim_id:fk field_claims?` |
| `descriptor_definitions` | Custom controlled descriptor definitions | `id:uuid!`; `code:text!`; `label:text!`; `category:enum!`; `data_type:enum!`; `allowed_values_json:json?`; `public:boolean!` |
| `record_descriptors` | Optional extensible values on any catalogue entity | `id:uuid!`; `entity_kind:enum!`; `entity_id:uuid!`; `definition_id:fk descriptor_definitions!`; `text_value:text?`; `number_value:decimal?`; `boolean_value:boolean?`; `json_value:json?`; `source_claim_id:fk field_claims?` |

### Descriptions and media

| Table | Purpose | Core columns / types |
|---|---|---|
| `text_content` | Synopses, descriptions, excerpts and language variants | `id:uuid!`; `entity_kind:enum!`; `entity_id:uuid!`; `content_type:enum!`; `language:bcp47?`; `body:text!`; `rights_policy_id:fk metadata_licences?`; `source_claim_id:fk field_claims?`; `visibility:enum!` |
| `media_assets` | R2 asset object and original-file metadata | `id:uuid!`; `r2_key:text!`; `sha256:text!`; `mime_type:text!`; `size_bytes:integer!`; `width:integer?`; `height:integer?`; `state:enum!`; `uploaded_at:timestamp!`; `approved_at:timestamp?`; `rights_id:fk media_rights?` |
| `media_links` | Scoped cover, portrait, sample or publisher-logo links | `id:uuid!`; `asset_id:fk media_assets!`; `entity_kind:enum!`; `entity_id:uuid!`; `role:enum!`; `is_primary:boolean!`; `sort_order:integer!`; `crop_json:json?` |
| `media_rights` | Rights and reuse permission evidence | `id:uuid!`; `rights_holder:text?`; `licence_name:text?`; `licence_url:url?`; `source_url:url?`; `credit:text?`; `verified_by:text?`; `verified_at:timestamp?`; `public_display:boolean!`; `api_redistribution:boolean!` |
| `media_variants` | Derived thumbnails and optimised image objects | `id:uuid!`; `asset_id:fk media_assets!`; `variant_name:text!`; `r2_key:text!`; `width:integer!`; `height:integer!`; `mime_type:text!`; `size_bytes:integer!` |

### Distribution and territories

| Table | Purpose | Core columns / types |
|---|---|---|
| `territories` | ISO-coded countries and distribution regions | `code:text pk!`; `name:text!`; `parent_code:fk territories?` |
| `distribution_rights` | Product publishing, streaming and redistribution scope | `id:uuid!`; `edition_id:fk editions!`; `territory_code:fk territories!`; `rights_type:enum!`; `start_date:partial_date?`; `end_date:partial_date?`; `rights_holder_id:fk organisations?`; `source_claim_id:fk field_claims?` |
| `product_offers` | Optional time-limited price/retailer data | `id:uuid!`; `edition_id:fk editions!`; `seller_id:fk organisations?`; `territory_code:fk territories?`; `currency:iso4217!`; `price_minor:integer?`; `offer_url:url?`; `valid_from:timestamp?`; `valid_to:timestamp?`; `source_record_id:fk source_records?` |
| `availability_events` | Historical stock/preorder/withdrawn state | `id:uuid!`; `edition_id:fk editions!`; `territory_code:fk territories?`; `availability_status:enum!`; `effective_at:timestamp!`; `source_claim_id:fk field_claims?` |

### Import, sources and quality

| Table | Purpose | Core columns / types |
|---|---|---|
| `metadata_licences` | Provider terms, retention and redistribution policies | `id:uuid!`; `name:text!`; `licence_url:url?`; `display_allowed:boolean!`; `storage_allowed:boolean!`; `external_api_allowed:boolean!`; `attribution_required:boolean!`; `expires_at:timestamp?` |
| `metadata_sources` | Provider identity, agreement and import policy | `id:uuid!`; `name:text!`; `source_type:enum!`; `licence_id:fk metadata_licences!`; `enabled:boolean!`; `base_url:url?`; `refresh_policy_json:json?` |
| `source_records` | Provider raw-record references, not trusted canonical entities | `id:uuid!`; `source_id:fk metadata_sources!`; `external_key:text!`; `payload_r2_key:text?`; `payload_hash:text?`; `fetched_at:timestamp!`; `licence_id:fk metadata_licences!`; `parse_status:enum!` |
| `field_claims` | One sourced assertion about one field | `id:uuid!`; `entity_kind:enum!`; `entity_id:uuid!`; `field_path:text!`; `value_json:json!`; `source_record_id:fk source_records!`; `confidence:decimal?`; `observed_at:timestamp!`; `chosen:boolean!`; `locked:boolean!` |
| `import_batches` | Import run boundaries and counters | `id:uuid!`; `source_id:fk metadata_sources!`; `started_at:timestamp!`; `finished_at:timestamp?`; `state:enum!`; `imported:integer!`; `updated:integer!`; `rejected:integer!`; `source_version:text?` |
| `import_errors` | Quarantined errors requiring review | `id:uuid!`; `batch_id:fk import_batches!`; `source_record_id:fk source_records?`; `error_code:text!`; `details:text!`; `resolved_at:timestamp?`; `resolution_notes:text?` |
| `verification_reviews` | Manual quality-check queue | `id:uuid!`; `entity_kind:enum!`; `entity_id:uuid!`; `issue_type:enum!`; `status:enum!`; `assigned_to_external_actor_id:text?`; `notes:text?`; `opened_at:timestamp!`; `closed_at:timestamp?` |
| `record_revisions` | Immutable canonical record history | `id:uuid!`; `entity_kind:enum!`; `entity_id:uuid!`; `revision:integer!`; `before_json:json?`; `after_json:json!`; `actor_external_id:text?`; `changed_at:timestamp!`; `reason:text?` |
| `merge_events` | Recorded merge/split and unmerge evidence | `id:uuid!`; `entity_kind:enum!`; `winner_id:uuid!`; `loser_id:uuid!`; `decision_json:json!`; `actor_external_id:text?`; `occurred_at:timestamp!`; `reverted_at:timestamp?` |
| `editorial_overrides` | Trusted editor choice to override source claims | `id:uuid!`; `entity_kind:enum!`; `entity_id:uuid!`; `field_path:text!`; `value_json:json!`; `reason:text!`; `actor_external_id:text!`; `created_at:timestamp!`; `expires_at:timestamp?` |
| `catalogue_audit_log` | Cross-record catalogue action trail | `id:uuid!`; `actor_external_id:text?`; `service_client_id:fk api_clients?`; `action:text!`; `target_kind:enum!`; `target_id:uuid!`; `details_json:json?`; `created_at:timestamp!` |

### Future API clients

| Table | Purpose | Core columns / types |
|---|---|---|
| `api_clients` | Registered clients including Chapter & Sound | `id:uuid!`; `name:text!`; `owner_external_id:text?`; `status:enum!`; `created_at:timestamp!`; `contact_email:text?` |
| `api_keys` | Hashed API credential inventory | `id:uuid!`; `client_id:fk api_clients!`; `key_prefix:text!`; `key_hash:text!`; `scopes_json:json!`; `expires_at:timestamp?`; `revoked_at:timestamp?`; `created_at:timestamp!` |
| `api_usage_daily` | Usage counts and quotas, not per-user reading data | `client_id:fk api_clients!`; `date:date!`; `endpoint_group:text!`; `requests:integer!`; `errors:integer!`; `bytes_sent:integer!`; `PRIMARY KEY(client_id`; `date`; `endpoint_group)` |
| `api_access_policies` | Per-client features and licensed field access | `id:uuid!`; `client_id:fk api_clients!`; `scope_code:text!`; `rate_limit_per_minute:integer?`; `daily_quota:integer?`; `field_policy_json:json!`; `updated_at:timestamp!` |

## Critical integrity and indexing rules

1. Index all foreign keys and all public search filters; use FTS-backed title/person search later, without mirroring records in browser storage.
2. `series_memberships` must allow prequels, half-numbered volumes, alternate orderings and one work in multiple series.
3. Missing values are NULL. Distinguish unknown, not applicable, withheld and contested when important, using verification/claim metadata.
4. Product page count and recording runtime never live solely on `works`; runtime is seconds with precision/source; optional track totals do not automatically override an asserted publisher runtime.
5. `media_links` must allow one representative work cover and separate edition cover(s), but at most one approved **primary** front cover per edition; enforce by a partial unique index where possible.
6. Raw source archives in R2 and source assertions must carry rights/retention permissions. Revoked/restricted source material must never leak into the public API.
7. Merge uses `record_aliases` and `merge_events`; old API identifiers continue resolving via redirects. Splits require explicit reviewed child identities.
8. All create/update/publish operations are authorised server-side and written transactionally with immutable revision/audit records. If the DB engine cannot provide the required transaction semantics in a particular Worker route, design an idempotent workflow before enabling writes.
9. Controlled vocabularies and field definitions are themselves versioned. Free-text descriptors use `record_descriptors` but high-frequency searchable fields get normalised indexes.
10. No member/private account records are copied to the bibliographic DB; external actor IDs exist only for catalogue audit attribution.

## Questions to settle before freezing v1.0

- Final engine and partition plan (single D1 vs managed PostgreSQL); actual index/storage benchmark required.
- Precise status and role enums, domain CHECK constraints, and nullable date precision.
- Author and recording relationships in multi-volume boxes, omnibuses, translated recordings and reissues.
- Licensing classification for every imported source and what is permitted in a future third-party API.
- Whether prices/offers are in the first release or excluded until a licensed source exists.
- The staging/media threat model and R2 transformation strategy.

## Compatibility with current site

The existing application database currently owns `works`, `editions`, `people`, `work_contributors`, `edition_contributors`, `series`, `series_works`, images and member-owned FK references. **Do not drop or redirect them yet.** The migration plan requires alias mapping for work/edition/person/series IDs and preservation of all `reading_experiences`, `reviews`, `favourite_people`, `curated_list_books`, `recommendations`, `club_reads` and any other referencing tables.
