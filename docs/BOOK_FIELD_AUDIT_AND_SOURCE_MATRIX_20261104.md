# Chapter & Sound — canonical book field audit and source-to-field matrix
**Audited:** 2026-11-04 · **Scope:** GitHub source on `catalogue/ten-book-readiness`, not live Cloudflare D1 contents.

## Audit boundary
Inspected `src/site/CatalogueBookEditor.tsx`, `CatalogueBookMetadata.tsx`, `CatalogueLinkedEditions.tsx`, `PublicBookPage.tsx`, `RoomBookView.tsx`, `src/worker/catalogue-import-quality.ts`, legacy `migrations/0001_catalogue.sql`, and dedicated BOOK_DB `catalogue-migrations/0001–0005`. The schema defines *capacity*, not proof that a field is populated, licensed, accurately verified, or currently exposed by a public endpoint. Existing records in production were not queried.

## Key distinctions
- **R (identity / structural requirement):** necessary to create an internally consistent canonical record; no fabricated value.
- **P (public completeness priority):** target for a good book page, but allow an explicitly unknown or missing state rather than excluding real books.
- **C (conditionally required):** only for the specified type of edition; some are publication quality goals rather than SQL NOT NULL constraints.
- **O (optional enrichment):** useful where known, not a blocker to catalogue identity.
- **X (not needed for core book page):** specialist metadata or community data; do not pursue 100% on every edition.
- **Internal:** a generated database ID, verification status and provenance are requirements of the *system*, not bibliographic facts to fetch from an API.
- A missing ISBN is not always wrong; editions can have an alternate stable identifier. Empty or unverified fields are not a licence to guess.
- Work, edition, recording, person, publisher and series are *linked entities*, not duplicate full book records.

## A. Canonical work and contributors
| Field / canonical storage | Level | Tier | Page? | Acquisition or derivation |
|---|---|---|---|---|
| Canonical work ID `works.id` | Work | R internal | link | Local UUID; deduplicate before generating |
| Canonical title `works.canonical_title` | Work | R | Yes | Publisher title, Open Library work record, Hardcover book, library catalogue |
| Author identity and credit `people`, `contributions` | Work | R | Yes | Publisher contributor listing, Open Library author ID, Hardcover contributor + identity checks |
| Work identity / source identifiers `entity_identifiers` | Work | R internal | usually no | Open Library work key, provider canonical book ID, publisher data |
| Work type `works.work_type` | Work | O | Optional | Publisher/catalogue classification; default `book` is a workflow choice, not externally verified |
| Subtitle / alternate titles `work_titles` | Work | O | Subtitle when known | Publisher, Hardcover, Open Library, national libraries |
| Original language `works.original_language`, `work_languages` | Work | P | Usually | Open Library/libraries/publisher; distinguish edition translation language |
| First publication date `works.first_publication_date` | Work | P | Yes | Publisher bibliography, national libraries, Open Library; retain year-only precision |
| Synopsis / short and long descriptions `text_content` | Work | P | Yes | Licensed publisher description, author website, editorial original copy; copying text requires rights |
| Subjects/genres `work_subjects`, `subjects` | Work | P | Yes | Open Library subjects, publisher classification, national-library MARC subjects; standardise taxonomy |
| Series identity and position `series_memberships` | Work | C if part of series | Yes | Publisher series, author bibliography, Hardcover book series, cross-check title/sequence |
| Other writers/translators/illustrators `contributions` | Work/version/edition | C where credited | Yes where relevant | Publisher credits, library MARC and actual edition |
| Original/translated/revised text version `work_versions` | Version | C where different | Yes if needed | Publisher edition statement and source language |
| Themes / moods / settings / pacing `record_descriptors` | Work | O | Enhancements | Editorial tagging, qualified taxonomy; never infer indiscriminately |
| Age audience / content notes `audience_descriptors`, `content_advisories` | Work | O or C for child-safety feature | Optional | Explicit publisher / authoritative classification, not guessed |
| Awards / literary relationships `record_descriptors`, `work_relationships` | Work | O | Optional | Awards bodies, publisher/author, verified sources |

## B. Individual edition
| Field / canonical storage | Level | Tier | Page? | Source / validation |
|---|---|---|---|---|
| Edition ID and parent work `editions.id/work_id` | Edition | R internal | link | Local canonical relationship; never merge only on title |
| Edition identity key `entity_identifiers` | Edition | R, can be non-ISBN | Optional | Exact Open Library edition key / Hardcover edition ID / ISBN / publisher or provider product ID |
| Format `editions.format` | Edition | P; may be `unknown` while researching | Yes | Explicit publisher binding, Hardcover `edition_format`, MARC 020 $q, Open Library `physical_format`; don't use default paperback as evidence |
| ISBN-13 / ISBN-10 `entity_identifiers` | Edition | C if assigned | Yes when available | Publisher, library MARC 020, Hardcover; checksum, edition-level match; don't manufacture one |
| ASIN or other product ID `entity_identifiers` | Edition | O / C for ISBN-less version | Optional | Platform product pages; distinguish proprietary ID from ISBN |
| Publisher `publication_events.publisher_id` | Edition | P | Yes | Official publisher catalogue, Hardcover publisher, library imprint / publication statement |
| Imprint `publication_events.imprint_id` | Edition | O | Optional | Publisher and national-library records |
| Edition release date `publication_events` | Edition | P | Yes | Publisher / national bibliography / Hardcover; retain partial-date precision |
| Edition language `editions.language`, `edition_languages` | Edition | P | Yes | Publisher/library/Hardcover; must not blindly copy original language |
| Edition title or edition statement `editions.title_override/edition_statement` | Edition | O | If materially different | Hardcover, publisher, MARC 250 |
| Pages `editions.page_count` | Printed edition | C for print quality target | Yes | Publisher, library MARC physical description, Hardcover; digital page counts not automatically print counts |
| Representative/edition front cover `media_links` | Edition/work | P for attractive public page; rights C before display | Yes if permitted | Publisher media kit, licensed cover provider, admin rights-checked upload; URL alone is not reuse licence |
| Binding / print trim / weight `edition_details` | Print edition | Binding P, dimensions O | Binding yes | Publisher product spec, ISBN-specific catalogue, MARC 020 $q; no inference from publisher or ISBN prefix |
| Ebook file format, filesize `edition_details` | Ebook | O | Optional | Digital distributor (if disclosed); DRM technical metadata isn't usually necessary |
| Edition status (preorder/out of print) `publication_events`, `availability_events` | Edition | O | Optional | Official publisher/distributor; time-sensitive |
| Territory / language variant `publication_events`, `distribution_rights` | Edition | O | Optional | Publisher/rights owner; rights to **distribute** differ from permission to display metadata |
| Price / retailer offer `product_offers` | Edition | X | No core requirement | Retail feed, per-region; expires and needs refresh |
| Large print / accessibility `edition_details` / descriptors | Edition | C when labelled | Yes when applicable | Explicit publisher / library identifier; large print is not synonymous with paperback |

## C. Audio (recording + edition + contributors)
| Field / canonical storage | Level | Tier | Page? | Source / validation |
|---|---|---|---|---|
| Recording identity, linked audiobook edition `audio_recordings`, `edition_recordings` | Audio | R for recording record | link | Publisher/audio platform ID, exact recording/version match |
| Audiobook / audio CD format | Edition | C | Yes | Explicit medium; downloadable audio ≠ audio CD |
| Narrator(s) and cast `contributions` | Audio | C for quality target, unknown permitted during research | Yes | Publisher audio listing, Hardcover contributors, Audible/Apple/Kobo/Libro.fm when available |
| Runtime `audio_recordings.duration_seconds` | Audio | C for quality target | Yes | Publisher/audio distributor/Hardcover `audio_seconds`; preserve precision; minor minute variance review |
| Abridged vs unabridged `audio_recordings.abridgement` | Audio | C for quality target | Yes if known | Explicit provider/publisher; do not default unabridged on import |
| Performance type (single, multi, full cast, dramatised, synthetic) | Audio | O | Optional | Explicit publisher or provider classification |
| Recording language | Audio | P | Yes where different | Publisher/platform; distinguish work language |
| Audio label, production publisher/imprint | Audio/edition | P | Yes | Publisher / studio / audiobook retailer |
| Recording date / remaster / producer / engineer | Audio | X | No core requirement | Production credits where known |
| Track list, audio codec / bitrate / sample rate `audio_tracks`, `audio_recording_details` | Audio | X | Not core | Distribution feed or legitimate owned media only |
| Audio sample / playback assets | Media | O; rights C | Optional | Explicit permission/licensed sample only |

## D. Media, provenance and member-generated fields
| Field | Tier | Rationale |
|---|---|---|
| Source ID + per-field provenance `metadata_sources`, `source_records`, `field_claims` | R internal | Preserve which source stated each fact, when checked, confidence, conflict, admin override |
| Rights policy for synopsis / artwork `metadata_licences`, `media_rights` | R before storing/displaying protected content | API accessibility does NOT imply permanent replication / display permission |
| Verification and publication status + revisions | R internal | Draft != verified != publicly published |
| User reviews, story ratings, narration ratings, shelves, reading progress | X for catalogue import | Generated by Chapter & Sound members; never copied from competitor user activity |
| Author portrait, biography, website, aliases, dates | O for book page | Belong to one canonical person profile; don't block book import |
| Cover-back images, image crops, alternate language covers | O | Enhance visual quality; one licensed representative cover suffices |

## E. Actual editor and public page, versus desired catalogue
- The create page currently exposes **title, author ID picker, work type, original language, first publication date, description, optional first edition, selected format, edition language, ISBN-13, ISBN-10, ASIN, page count, publisher, release date, audio narrator, performance, abridgement, duration, cover upload**. ISBNs are only required *if present* to pass checksum validation. It saves drafts.
- Metadata panels separately edit **identifier, publication event/publisher, recording narrator/cast and genres**. Linked-edition editor also stores edition title/statement and recording details.
- Public book routes currently show **title, subtitle, author, first year, synopsis, cover, edition format, language, publisher, date, pages, duration, abridgement, ISBN/ASIN, narrators, community reviews/ratings**. Genres/series are not shown in the `PublicBookPage.tsx` payload reviewed, despite dedicated catalogue tables and metadata admin controls.
- **Risk:** new-book editor starts with `paperback`, `en` languages, `single_narrator`, `unabridged` defaults. Automated enrichment must never treat those as verified fields.
- **Risk:** existing `assessImportQuality` validates presence of format, while `unknown` may count as present. Publication-quality rules need a separate `format != unknown` check rather than silently declaring full coverage.
- **Scope:** the dedicated `BOOK_DB` is the canonical book store; legacy `DB` remains for member data and compatibility bridges. This does **not** mean two author catalogues should be maintained.
- **Limit of audit:** a schema/code review cannot establish how many real rows in Cloudflare D1 have each field. A read-only production coverage query must follow after source registry approval.

## F. Source-to-field acquisition matrix
Legend: **S** = explicitly documented field or strong known fit, **P** = possible but records may be sparse, **—** = not a suitable expectation, **B** = currently blocked/unreliable in our tests. Columns describe *field capability*, not proof of rights, completeness or a successful result for the target ISBN.

| Source | Work + author | ISBN + edition | Binding | Publisher + date | Description + genres | Audio narrator + duration | Machine access / reuse status |
|---|---|---|---|---|---|---|---|
| Open Library works/editions/dumps | S | S | P | P | P | P | Public API & dumps; source and rights rules per field |
| Hardcover GraphQL API | S | S | S | S | P | P/S (duration explicit schema) | Official token API; beta; public-product/user-data restrictions; pilot 9/22 ISBNs found, 1 with format |
| Library of Congress SRU/MARC | S | S | P via MARC 020 $q | S | P subjects | P for catalogued media | Official SRU; first 5 target ISBNs unmatched |
| National library catalogues / British Library BNB | S | S | P MARC/ONIX bindings | S | P | P | Verify exact API/feed, bulk terms and access availability |
| Publisher catalogue / ONIX supply | S | S | S | S | S if licensed | S if audio catalogue | Best authority for edition/product fields; access and rights differ by publisher |
| Penguin Random House product pages / feeds | S | S | S | S | S if permitted | S on audio products | Pilot already has verified publisher ISBN/audio evidence; assess structured access |
| Simon & Schuster products / feeds | S | S | S | S | S if permitted | P/S for their audio titles | Verified exact-ISBN examples in earlier evidence batches |
| Audiobook publisher / distributor feed (e.g. PRH Audio) | S | P/S | S medium | S | P | S | Need authorised feed, exact recording identity, permitted reuse |
| Audible / Apple Books / Kobo / Libro.fm public catalogues | S | P (some audio have no ISBN) | S medium | P | P | P/S | Retail-specific; automated access and reuse permissions must be established |
| ISBNdb or other paid bibliographic aggregators | S | S | P/S | S | P | P | Payment and licence-dependent; never assume audiobook coverage |
| Google Books | S | S | — (Google ebook sale flag not edition binding) | P | P | — | In pilot HTTP 429 on all 22 requests; API terms restrict durable copying |
| ISBNsearch.org public pages | S | S | S on some records | S | P | P | Interactive pages useful but automated fetch returns browser verification; no approved bulk access |

**Critical coverage rule:** no single provider promises 100% coverage for all editions. Use a field-priority resolver that only asks a source for fields it can supply; link results by exact ISBN/recording/product ID plus book/author identity; record source licence, field claims and conflicts.

## G. Source routing plan (for implementation)
1. **Identity discovery:** publisher + Open Library work/edition IDs, Hardcover identifiers, national libraries. Do not create another canonical author when the record has a confirmed existing person identity.
2. **Edition structure:** exact ISBN / provider product ID, work link, format, publisher, language/date. Publisher/product records first for binding, bibliographic catalogues second. No platform ISBN-prefix heuristics.
3. **Audio:** independently search audio-specific feeds by work + recording/product identity; map narrator and duration to *recording*, not blindly to all audiobook editions.
4. **Description/subjects/cover:** take only rights-cleared data. Distinguish text rights, media rights, and factual bibliographic fields.
5. **Reconciliation:** collect field claims separately, prefer explicit publisher-specific evidence when identities align, display conflicts, lock admin-verified claims, never auto-overwrite.
6. **Coverage report:** compute separately (a) identity integrity, (b) mandatory publication fields, (c) applicability-aware public completeness, (d) rights clearance, (e) availability of source evidence; include individual field and source gap breakdown.
7. **One staged output:** issue a single canonical manifest per work with linked editions, audio recordings and provenance. Never maintain 50 different visible book entries or author directories.
8. **Read-only first:** verify source licences and create a dry-run matrix before any production writes. Do not require users to hand-fill every unknown ISBN.

## H. Precise next implementation deliverables
- Machine-readable `catalogue-field-registry.json` for every field above: `entityKind`, `fieldPath`, `requirement`, `appliesTo`, `display`, `sources`, `rightsClass` and `validation`.
- Read-only coverage audit script over the actual local 88-edition manifest to report unknown, missing, nonapplicable, conflicting and source-unlicensed fields separately.
- A read-only production BOOK_DB coverage query and admin-only dashboard after confirmed deployment; do not assume staging file values are in production.
- A source capabilities / licence registry; connectors must declare permission and rate-limit status instead of claiming all retrieved data is importable.
- Resolve the ambiguous two edition identities and known audio duplicates *before* counting 88 as independently verified real editions.
- Update publication quality checks to be applicability-aware and not mistake default `unknown` as verified `format`.

**Decision:** '100%' means every *applicable required* field is either verified or explicitly flagged as unresolved with a source-search history; optional and technically nonapplicable fields must not become artificial blockers. A factual 100%-filled target cannot be guaranteed by any known API, and must not be achieved by invention.
