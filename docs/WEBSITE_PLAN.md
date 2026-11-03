# Website implementation map — 3 November 2026

**User-directed priority: website first; catalogue provider integration last.** This supersedes the original catalogue-first schedule. The user approved the Editorial theme and specific page mockups. The current implementation is the initial shared UI and schema foundation, **not completion of the approved flows**.

## Required journeys

| Area | Agreed behaviour | Current implementation |
| --- | --- | --- |
| Public homepage | Editorial, separate community reviews, verified catalogue, community gateway | Responsive layout and empty states; API read wiring |
| Public book detail | Canonical work, formats/editions, ratings, review tabs, author/narrator links | Basic book detail page |
| Community reviews | Search/filter, review detail, spoiler hiding, public authors, story/narration scores, report/helpful | Responsive list/detail, basic filter/spoiler hiding only |
| Member auth | Email/password, verification, reset, resend, deletion | UI blocked pending secure auth and email sender |
| Personal onboarding | Profile photo/name, formats/genres, author/narrator portrait orbit, personal welcome | Routes only; components still required |
| Personal homepage | New/returning states from live account data, explained recommendations | Public home only |
| Add a book | Work search, edition selection, shelf status, cloud save and confirmation | Route only |
| My Bookshelf | Status/count filters, grid/list, search, privacy | Route only |
| Personal reading space | Progress changes, print/audio units, private thoughts, rereads, history | Schema prepared; no editor |
| Finish and review | Finish → optional draft → preview → explicit publish → confirmation | Schema prepared; no editor |
| Public reader profiles | Handle, opt-in shared activity, author preferences | Schema partially prepared; no screen |
| Reading year | Year select, unique works vs experiences, print/audio distinctions | Route only |
| Lists | Public curated lists and individual list | Index route only |
| Authors/narrators | Verified people directory, full bibliographies | Directory routes only |
| Series | Order guide, volume links, format editions | Route only |
| Discussions | Topics, simple flat replies, reactions, saved topics, reporting | Index route only |
| Book clubs | Membership, current/past reads, spoiler rooms, schedules | Index route only |
| Recommendations | Ask and reply with linked work and personal reason | Index route only |
| Challenges | Browse/join, progress eligibility, optional privacy, detail | Index route only |
| Admin | Catalogue tools, moderation, image manager, homepage feature, theme preview | Protected route placeholder only |
| Theme 2 | Reading Room: different navigation/layout, not just colours | Architecture still required |
| Catalogue | Provider discovery, accurate editions/recordings, provenance and rights | Deferred until website journeys are complete |

## Data/security principles

- All persistent member data, reviews, discussions, clubs, challenges and settings must live in Cloudflare D1.
- User-owned operations must be authorised server-side and scoped by the authenticated user ID.
- No browser storage as authoritative persistence.
- Email verification must be real, with an authorised sending provider and secure recovery.
- A public review is deliberate; drafts, personal notes, reading progress and private ratings stay private.
- Spoiler protection applies to previews, search excerpts and public feeds.
- An audiobook may have a narration score; print and ebook reviews must not.
- A user's multiple rereads or editions must not overweight community aggregates.
- A book work appears once in search with selectable editions.
- Public pages do not imply David is the sole reviewer or privileged author.
- Mockup illustrations, reviews, cover art, dates and statistics must not enter live content as facts.
- User-approved reference images should be inspected and compared before marking a page visually complete.

## Engineering completion order

1. Stabilise site build, add CI, tests and accessibility checks.
2. Better Auth with project-specific D1, verified email delivery and real account management; migration strategy.
3. Member onboarding, profile and cloud preferences, including author/narrator selection and portrait orbit.
4. Canonical work/edition chooser and private bookshelf/progress/thoughts workflows, with a manual missing-book mechanism.
5. Review editor/drafts/preview/publish, public reviews, reports/helpful votes and moderation.
6. Reader home, book/public profiles, year stats, saved next reads, curated lists.
7. Community discussions, clubs, recommendations and challenges with per-user permissions.
8. Admin console and image rights handling; redesign against all approved mockups, mobile-first checks.
9. Catalogue-provider adapters and full coverage/rights verification.
10. Final security/a11y/performance/integration testing, deployment review and authorisation.

## Unfinished external setup

Cloudflare D1 has **not** been created or connected for this repository. No R2 bucket, real mail-sending service or secrets have been configured. The project must not borrow infrastructure or credentials from other apps. The site must not be claimed to be live or complete. Public deployment requires explicit approval.

## Locked visual-design requirement (reconfirmed 3 November 2026)

Read **[LOCKED_VISUAL_THEMES.md](LOCKED_VISUAL_THEMES.md)** before implementing or reviewing any screen. Editorial and Reading Room are two distinct full layouts with shared functionality, not palette switches. The latest supplied screenshots are visual targets. Neither theme is currently marked visually accepted, and Reading Room remains to be implemented. Maintain website-first / catalogue-last priority.
