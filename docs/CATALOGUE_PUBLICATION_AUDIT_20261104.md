# Catalogue publication audit — 4 November 2026

## Scope and audited example
The current admin example is **The Business of Dying**, attributed to **Simon Kernick**, with an **ebook** edition and ISBN-13 **9781407084350**. The user reports publishing the book in the production admin.

**Important evidence boundary:** This audit inspected GitHub source and published code paths. The production Cloudflare Workers host and its D1/R2 endpoints could not be reached from the auditor's environment. No claim is made that the production record, asset, page, or author's profile was inspected directly. No production records were written or repaired by the audit.

## Code-level findings and changes
| Area | Finding | Fix / coverage | Production proof |
|---|---|---|---|
| Saving drafts | Former default created books as private drafts, but draft navigation was difficult to find | Dedicated `/admin/catalogue/drafts`, `/new`, `/published`, `/all` and `/book/:id` routes; saved-book page reloads by ID; 50-record pagination and title search | Not yet checked |
| Publishing | Work status transitions use the owner-only API and expected-revision check | Edit page clearly offers Publish and Return to Draft; same work ID | Not yet checked |
| Work and author DB identity | BOOK_DB work/author relationship through contributions | Canonical author selection by ID, preserved through the public book adapter | Not yet checked |
| Public book discovery | `/api/books` combines canonical work records with historical member DB references | Canonical full metadata now wins when both databases contain the same work ID | Not yet checked |
| Public book page | `/api/book/:id` falls back to BOOK_DB for works absent from the old DB | Author ID now exposed and linked to `/person/:id` | Not yet checked |
| Author directory | Previously combined old and canonical people, creating duplicate choices | When BOOK_DB exists, public directory uses canonical people only and filters to contributors of published works | Not yet checked |
| Author bibliography | Canonical profile reads work contributions and filters unpublished books | Public API and in-editor publication audit compare the same work and author IDs | Not yet checked |
| Ebook ISBN | Invalidly escaped ISBN validation previously rejected valid ISBNs | Shared validation for ISBN-10/ISBN-13, regression fixture for 9781407084350 | Not yet checked |
| Cover | Creation attached cover to first edition, while editor initially inspected only book-level cover | Editor and public adapter use first-edition fallback; audit probes public cover with HEAD | Not yet checked |
| Member shelves/reviews | Member DB has FK references, canonical work data is elsewhere | Existing same-ID reference bridge creates member FKs only on authenticated member actions; does not merge author identities | Not yet checked |
| Cross-DB duplicate legacy books | Distinct IDs can represent the same title/author | Live audit warns if public search returns identical title/author under additional IDs; no destructive merge | Requires identity review |
| Admin overview counts | Admin dashboard previously counted legacy app books and contributors | Overview now reads canonical books, drafts, published books, editions and contributors from BOOK_DB, while member/review totals remain in DB | Not yet checked |

## On-demand and automatic live audit
When opening `/admin/catalogue/book/:id` for a published work, the **Publication checks** panel now initiates read-only checks against the deployed service and can be rerun manually. It checks:
- Saved work ID, status and exact title in BOOK_DB
- Saved author credit, edition count, identifier count, publication events and primary cover links
- The public book detail response, synopsis, formats and ISBNs against the saved metadata
- Presence in `/api/books` visitor search, and potential duplicate title/author records
- Canonical public author directory and author profile bibliography
- Whether the primary book/edition image responds to a HEAD request

**It does not prove** that every responsive layout renders correctly in a browser, that an end-user can complete a shelf/review write, or that old legacy review identities have an audited crosswalk. These require separate browser and controlled production integration tests.

## Regression coverage added
- `tests/catalogue-draft-workflow.test.ts`
- `tests/catalogue-admin-overview.test.ts`
- `tests/catalogue-public-publishing.test.ts`
- Existing SQLite metadata and ISBN validation tests
- Public-site audit logic and styling in `CataloguePublicationAudit.tsx`

Changes have been committed directly to `main` per the project owner's instruction. The new main-branch changes have **not** been validated by a fresh full GitHub CI run in this audit session, because existing workflow-run access only exposed pull-request-triggered checks.

## Next safe verification
1. Confirm latest deployment is serving updated source.
2. In Admin → Book Catalogue → **Published**, open **The Business of Dying**.
3. Read the automatic **Publication checks** results. Verify saved ISBN and author ID, public listing, author bibliography, and image response.
4. Only after the read-only checks pass, test a controlled member shelf/review operation using a designated test account. Do not create or alter production ratings merely to complete this audit.
5. Review any same-title cross-database duplicates using verified identifiers rather than merging by name/title alone.
