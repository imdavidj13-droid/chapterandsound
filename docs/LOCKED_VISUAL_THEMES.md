# LOCKED VISUAL DESIGN CONTRACT — Chapter & Sound
Updated 3 November 2026 after the user supplied the approved screenshot collection again.

**Status:** Visual specification, NOT a claim that the deployed UI already matches it. The supplied image references are authoritative. Do not silently substitute a generic design or generated examples.

## Two genuinely different, complete themes

**Editorial (Theme 01 — default)**

- Warm ivory/cream paper surfaces, burgundy actions and text accents, discreet sage secondary areas.
- Literary serif headlines, clean sans-serif supporting copy, fine rules, large whitespace and a restrained publishing/editorial rhythm.
- Horizontal top navigation, magazine-like hero compositions, content-first layouts, intentional two-column reading areas and elegant cover/review cards.
- The signup/verification/welcome flow uses the approved Editorial designs, including the circular author/narrator orbit.
- My Bookshelf, progress and private thoughts, review creation/preview/publish, canonical book overview, editions, community reviews, discussions, clubs, challenges and reader pages must match the respective approved Editorial screenshot compositions—not just the colours.

**Reading Room (Theme 02 — distinct product experience)**

- White and pale sage foundations, forest-green actions, modern rounded content cards and softer panel surfaces.
- **Sidebar navigation** and dashboard/browsing spatial hierarchy, not Editorial's horizontal-nav design with different colours.
- Different content placements: dashboard-oriented summaries, bookshelf panels, inset profile modules, different card density and grouping, different responsive navigation.
- Favourite-people selection uses a natural circular/cluster arrangement, with name/count/removal access equivalent to Editorial Orbit.
- On mobile the desktop sidebar must intentionally transform into a usable narrow-screen navigation system. It must not leave an empty sidebar column or cause horizontal scrolling.
- Reading Room must render the same real entities, routes, permissions, preferences and interactions as Editorial; it is **not** an alternate database or a mockup-only preview.

## Single shared domain, separate design implementations

```text
app/
  shared/
    routing, sessions, data fetching, permissions, form state,
    validation, error handling, services, API types
  themes/
    editorial/
      shell, navigation, home, book, shelf, review, onboarding,
      community, profiles, book clubs, challenges, theme CSS
    reading-room/
      shell, navigation, home, book, shelf, review, onboarding,
      community, profiles, book clubs, challenges, theme CSS
  admin/
    independent moderation/catalogue/settings design
```

This is a target module boundary, **not** a statement that the current repository already uses this file structure. Theme IDs are stable: `editorial`, `reading-room`. Never build theme switching as mere root colour variables or a CSS filter. Each presentation must be able to change navigation, page composition, component structure and typography.

Theme preference is server-persisted per verified member. For anonymous visitors use a stable server/site default until an appropriate permitted preference strategy exists; browser local storage is never the authoritative store. Both themes resolve the same semantic route and backend state. Admin remains theme-independent.

## Reference matching and quality gates

For EVERY page and both themes:
1. Identify the exact user-approved image for that page; do not pretend an inaccessible screenshot was inspected.
2. Match desktop composition, navigation, typography, whitespace, spacing, dividers, sizes, image cropping and CTA placement.
3. Preserve the unique personality of each theme. A screenshot of Editorial tinted green **fails** Reading Room acceptance.
4. Verify narrow mobile and tablet layouts, text resizing, focus and keyboard access, reduced motion, captions/labels and no horizontal overflow.
5. Never copy mockup book covers, fake author portraits, review text, ratings, member profiles, totals or dates into production as factual content.
6. Compare screenshots of the rendered site against the reference images and log discrepancies; no page is marked visually accepted without this comparison.
7. Apply feature parity checks: both themes use the exact same live, cloud-backed content, privacy controls, review publication and moderation rules.

## Screenshot families included in the brief and user-provided image collection

- Public/home and personalised new/returning member home.
- Account creation, verification, expired-link recovery, profile and reading-taste onboarding, favourite author/narrator selection, personalised welcome.
- Find book, choose edition, shelf status entry and save confirmation.
- My Bookshelf, private reading space, progress editor, private thoughts.
- Canonical public book overview, community reviews, audiobook recording/edition, full published member review.
- Mark finished, write review, preview and publish confirmation.
- Community home, single-thread discussion, book clubs, recommendation requests, reading challenges.
- Reader profile, My Reviews, My Reading Year and challenge detail.
- Author and narrator directories/profiles, reading-order series guides.
- Reading Room layout concepts including modern sidebar and portrait cluster.

The 20 images most recently shared reaffirm the original design references in the project brief. Keep source filenames/asset pointers when known, and require a direct visual comparison whenever implementing a target page.

## Rollout rule

Complete and visually verify Editorial first; build Reading Room as a separate family of layouts before declaring **both** themes delivered. Until then a theme selector must not imply both are finished. Refactor existing page components into shared data/controllers and separate presentation implementations, without discarding the current functional work.

**Delivery status as of this document:** current React site is still largely Editorial-specific. Reading Room is **not implemented**. Existing routes, APIs and styling are work in progress, and no completed visual fidelity audit has been performed. Do not report either theme complete prematurely.

The user directed the project to prioritise full website journeys and leave external catalogue-source integration until the website is built; this priority remains unchanged.
