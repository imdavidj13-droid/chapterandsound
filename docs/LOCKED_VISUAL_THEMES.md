# Chapter & Sound — LOCKED DUAL-THEME DESIGN CONTRACT

**Approved:** 4 November 2026  
**Status:** Authoritative product and visual specification. **Design approval is not implementation or deployment approval.**

> **SUPERSESSION NOTICE:** This document replaces the earlier 3 November 2026 text of `LOCKED_VISUAL_THEMES.md` wherever it conflicts. The two newly accepted homepage visual directions, together with the supplied original Editorial homepage screenshots, supersede earlier exploratory homepage proposals, generic recolour approaches and prior generated mockups. Do not derive a new page from stale mockup descriptions.

**Companion specification:** [DUAL_THEME_PAGE_LAYOUTS.md](./DUAL_THEME_PAGE_LAYOUTS.md). Its page-by-page design rules are mandatory when building or refining pages.

## 1. The non-negotiable product rule

Chapter & Sound has **two distinct front-end experiences**, not two colour schemes:

1. **Editorial** — theme ID `editorial`, default. Classic literary editorial publication with horizontal navigation, airy composition and warm ivory/burgundy/sage styling.
2. **Reading Room** — theme ID `reading-room`. Contemporary reader dashboard with a dedicated left sidebar on desktop, forest-green/sage/white styling and distinctly different content grouping, navigation and page composition.

These are **two presentations of the same product**, not different websites, separate sections, separate book catalogues or separate databases. Each shared semantic route must preserve real records and permissions while giving each theme a genuinely different, purpose-built layout.

**A theme implementation that changes only CSS variables, colours, font faces or hero imagery FAILS.** Different page regions, information architecture, spatial hierarchy, navigation and interactions are required.

## 2. Homepage designs — APPROVED AND LOCKED

The current homepage reference set has **four states**, not four unrelated pages:

| Theme | Member state | Reference status |
|---|---|---|
| Editorial | New member | **LOCKED** — user-supplied original screenshot, `Welcome to your reading world(2).png` |
| Editorial | Returning member | **LOCKED** — user-supplied original screenshot, `Chapter & Sound Returning Member Homepage(2).png` |
| Reading Room | New member | **LOCKED DIRECTION** — lower-left quadrant of the four-concept image approved in conversation on 4 Nov 2026 |
| Reading Room | Returning member | **LOCKED DIRECTION** — lower-right quadrant of the same four-concept image |

**Reference provenance:** The original Editorial PNGs were provided in conversation, not committed to this repository. The Reading Room mockup was generated and approved in conversation, not established as a committed design asset. Do not claim an image was reviewed from Git merely because it is named here. When performing a pixel-level implementation comparison, request/locate the actual approved reference bytes or add authorised copies as repository design assets before calling a page accepted.

### Editorial — new member home

- Ivory page and top navigation: Chapter & Sound brand at left, **My Home / Discover / Reviews / My Bookshelf**, search and account/profile.
- Three-part welcome: **left** large sage-toned “Your bookshelf starts here” illustration/action card; **centre** major burgundy welcome with personalised name, fine editorial eyebrow and prominent **Add your first book** action; **right** compact “Your taste” with selected tastes and followed authors/narrators.
- Below the welcome: full-width **A few places to begin**, a cover-led personalised recommendation strip with textual reasons and **Save to my shelf**; then a recent community/review section.
- Whitespace, typography, rules, illustration treatment and content balance should follow the actual supplied screenshot. A giant generic full-width photographic hero is **not** an acceptable substitute.

### Editorial — returning member home

- Same brand and horizontal nav, but a **different home state**, not the new-member empty shelf message.
- Refined welcome-back band with an understated book/coffee background and **Add a book** action.
- **Continue your chapter** takes the main column, showing current book/edition, audiobook or print status, visible progress and **Update progress**.
- **Your year so far** forms a secondary panel with genuine reading, page and audio progress.
- **Picked for you** recommendations with cover, explanation and save actions; **Next on your shelf** as a separate saved-read module; **Latest from David / community reviews** below with genuine review content.
- Show only live information available for the signed-in member. No fixed books, authors, ratings, progress counts or fake recommendations.

### Reading Room — new member home

- Clearly distinct **dark forest-green left sidebar** with Chapter & Sound branding, primary routes (Home, Discover, Reviews, Bookshelf, Audiobooks, Reading Challenges, Community, Settings as available), and signed-in profile at lower edge.
- Light/sage application canvas, softly rounded white cards, forest-green controls.
- A composed **“Your reading room awaits”** welcome feature with warm reading-space photography/illustration (appropriately licensed), a clear **Add your first book** CTA and **Explore books**.
- Below: an ordered **Recommended for you** browsing shelf using actual books and preference-backed reasons where available; alternatively an honest discovery/empty state if no verified recommendations exist.
- This is a welcoming workspace/dashboard, **not an Editorial homepage recoloured green**. Avoid its three-column newspaper-style feature placement.

### Reading Room — returning member home

- Retain the Reading Room sidebar and compact dashboard header.
- Welcome back on the light canvas with a compact personalised salutation.
- Top row of **real** member metric cards (books finished, pages logged, audio listened, challenges if implemented).
- Main content is **Continue reading** with current formats and progress actions; beside it a distinct **Next in your shelf** saved-book action panel.
- Recommendations and community activity may follow in appropriate dashboard modules backed by live data.
- Avoid replicating Editorial's large photographic welcome strip or long magazine rows.

### Homepage states and safeguards

- The **same user** can use either theme and retains the same shelf, preferences, reviews and reading progress.
- New vs returning is driven by actual **member reading/onboarding state**, not an invented timestamp, mockup switch or hardcoded member name. Anonymous home has its own appropriate empty/discovery state.
- The screenshots' example names, books, covers, author photos, star ratings, summary numbers, copy and dates are **illustrative**, not seed data. Never put illustrative records in production.
- If member data is absent, show meaningful empty/next-step states; never fabricate content to fill cards.
- The lower two quadrants of the approved composite are **Reading Room**, and the upper two are explanatory comparison. The original user-supplied Editorial PNGs are **higher-priority Editorial references** than the upper composite quadrants.

## 3. Visual and interaction DNA

| Contract dimension | Editorial | Reading Room |
|---|---|---|
| Navigation | Horizontal top nav, discreet secondary actions | Dedicated desktop sidebar, compact topbar/content tools |
| Canvas | Warm ivory / cream paper | White / pale sage / soft inset surfaces |
| Primary accent | Deep burgundy | Deep forest green |
| Secondary accent | Restrained sage and warm neutral | Sage and soft green neutrals |
| Typography | Literary serif headlines, editorial hierarchy, readable supporting copy | Refined display headlines + crisp dashboard labels and practical typography |
| Composition | Magazine features, fine rules, large whitespace, editorial sections | Rounded modules, compact metrics, sidebar/workspace grids |
| Books | Prominent covers, supporting rationale and reviews with generous breathing room | More operational shelf cards, progress/format badges, clear actions |
| Personalisation | Taste as a magazine inset/curated section | Taste, progress and recommendations as dashboard modules |
| Mobile | Reflow horizontal navigation into accessible menu, article-first reading flow | Transform sidebar into fully usable compact navigation/drawer; no empty rail |

Brand identity and data entities remain recognisably Chapter & Sound in both, without forcing matched spacing, header height or card geometry.

## 4. Every page has two purpose-built layouts

The compulsory page-by-page map, route equivalence, presentation differences and mobile behaviour are defined in [DUAL_THEME_PAGE_LAYOUTS.md](./DUAL_THEME_PAGE_LAYOUTS.md). This covers home, discovery/search, book details and editions, audiobooks, authors/narrators, bookshelf, reading progress, reviews and publishing, community, clubs, challenges, reader profiles, yearly summaries, onboarding, preferences/account, and empty/error states.

**Do not design or implement only one theme and copy its DOM into the other with different colours.** It is acceptable to share fetching, types, actions, validation and domain logic; distinct themes must have distinct presentation composition.

## 5. Implementation boundaries and data integrity

Target structure (not a claim that the existing repository uses these paths):

```text
src/site/
  shared/                 route logic, fetch/state, domain models, permissions
  themes/
    editorial/            shell, navigation, every page's Editorial view
    reading-room/         shell, navigation, every page's Reading Room view
  admin/                  separate, theme-independent control centre
```

- Keep IDs exactly `editorial` and `reading-room`. A member's theme preference is server-persisted; local storage cannot be authoritative.
- Use the **same canonical BOOK_DB work/edition/person IDs**, the same member DB, routes, reviews, shelf records, and permission rules.
- Theme switching does not re-create records, reset onboarding, change member identity, alter publication state or create alternative catalogues.
- Admin remains distinct and is not subject to the two public themes.
- On both themes test signed-out, new verified member, returning member, incomplete onboarding, no books, API failures and limited metadata.

## 6. Visual fidelity, accessibility and delivery gates

For each page in **both** themes:

1. Locate its exact approved screenshot, if one exists. If it does not, create a new design for review under this contract; do not label unreviewed mockups “locked.”
2. Compare desktop screenshot of the *rendered site* against the real reference for composition, grid, whitespace, hierarchy, typography, imagery, call-to-action placement and navigation.
3. Test tablet and mobile for navigation adaptation, content legibility, keyboard/focus, reduced motion, alt text and absence of horizontal scrolling.
4. Check feature parity and backend parity with the opposite theme, including permissions and error states.
5. Use real API-backed records and truthful empty states; no illustrative/mockup facts in live UI.
6. Record discrepancies and explicit approval before marking a page visually complete.

**Priority:** Make Editorial match the supplied references first, then bring Reading Room's separate layouts to equivalent completeness. The approval of the two Reading Room homepage concepts **does not imply the current deployed homepage matches them**.

## 7. Superseded guidance and implementation status

**No longer authoritative:** generic “two theme colour palettes” interpretations, earlier unapproved homepage variations, the 4 Nov collage previously rejected by the user, and any claim that the Reading Room homepage is simply Editorial's layout with a sidebar/colour swap.

**Current code reality (repository inspected 4 Nov 2026):** `src/site/themes/ThemeShell.tsx` contains an Editorial horizontal header, a Reading Room sidebar shell and a `RoomHome` component. Some themed implementations exist, but **the screenshots are not yet pixel/structurally verified, and page-by-page parity is not established**. The older statement “Reading Room is not implemented” was too absolute; the correct status is **partially implemented, not yet approved as visually complete**.

**Scope:** This documentation update locks design requirements only. It neither changes live pages nor deploys them, does not alter any production records, and does not certify a screenshot comparison.

**Catalogue work:** Book-data intake continues on its own safety gate; it must not be confused with theme design delivery. The canonical catalogue architecture remains unchanged.
