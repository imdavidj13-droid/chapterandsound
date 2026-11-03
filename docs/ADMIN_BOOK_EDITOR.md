# Admin Book Editor — agreed design and implementation contract

Updated: 3 November 2026

## Primary design: single-page editor
Use the existing `src/site/CatalogueBookEditor.tsx` as the foundation. Keep the forest-green admin identity, large touch-friendly controls, clear numbered groups, and an always-visible desktop cover preview that stacks below the details on mobile. Creation includes **canonical book information and its first edition in one submission**. When an audio format is selected, reveal narrator, recording duration, abridgement, performance and audio publisher/recording metadata where supported. Do not create duplicate work records for different editions.

## Other agreed design directions
- **Guided creation**: book details → editions/audio → review and publish. Optional later entry mode sharing the same state, validation and APIs.
- **Tabbed workspace**: details, editions, images and preview. Suitable for editing existing records. Must use the same work and edition identities; do not create a second catalogue or separately maintained content.
- These are **layout options**, not three competing databases. The single-page editor is the default.

## Required behaviours and acceptance criteria
1. Search existing canonical works **before** adding; warn of potential duplicate title/author, and provide a safe path to add an edition to an existing work.
2. Search/select a **specific existing author by ID**; only offer creation of a new author through an explicit confirmation. Plain unverified name matching must not silently merge homonyms.
3. Edit existing works and associated editions from the same interface, with a version/revision check and visible saving/error states.
4. Show supported formats (paperback, hardback, ebook, audiobook, audio CD) and only applicable fields. ISBN-13 checksum validation; ISBN-10 and ASIN separately, with publisher and edition date.
5. For audio editions show recording-specific fields and **link narrators by person ID**, with the same duplicate/homonym precautions.
6. Live cover preview, alt text, permitted image type/size and rights/provenance confirmation. Do not imply upload success when R2 is unavailable; never treat preview URLs as persisted.
7. Show clear **Save draft** and **Publish** actions only after matching backend endpoints/permissions and verified publication rules exist. Until then retain truthful existing save behaviour and show unpublished/verification status. No UI-only publishing.
8. Keep publication separate from verification; never auto-mark a new record as verified on save.
9. Operate on dedicated BOOK_DB; preserve legacy records and member activity; migration/deduplication must be explicit and audited.
10. Responsive desktop/tablet/mobile, keyboard support, labelled inputs, focus states, no horizontal scrolling, accessible errors, no fake records or fabricated covers.
11. Review mode displays canonical work, linked contributors, first edition, audio-specific details, media rights and publication state **from saved server data**.
12. Avoid destructive changes and don't claim live persistence until DB bindings and authenticated endpoints are confirmed.

## Current code audit (3 Nov 2026)
- **Present:** Forest-green numbered single-page creation form; work and optional first edition saved through `POST /api/catalogue-admin/works`; conditional audio section; author name suggestions; cover preview and optional rights-checked upload; basic responsive layout.
- **Gaps requiring code and backend work:** no real author-ID picker (currently name/datalist); no duplicate-work preflight; no single unified existing-work/edition editor; no review/publish workflow; narrator currently a free-text name; no audio-specific publisher input; no strong client-side ISBN validation.
- **Safety:** `CatalogueWorkbench.tsx` has a separate basic metadata edit flow; never replace it with a mock editor that only stores data locally.

## Scope relative to public themes
Admin is theme-independent and stays forest green. Editorial and Reading Room are public/member presentation themes, not admin skins. Read `docs/LOCKED_VISUAL_THEMES.md` for those separate requirements.
