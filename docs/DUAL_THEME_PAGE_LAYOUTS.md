# Chapter & Sound — Dual-theme page layout matrix

**Status:** Locked implementation requirements as of **4 November 2026**.  
**Authority:** [LOCKED_VISUAL_THEMES.md](./LOCKED_VISUAL_THEMES.md) (master design contract).  
**Theme IDs:** `editorial`, `reading-room`.  
**Homepage approval:** Both new-member and returning-member homepage directions for both themes are locked; remaining pages retain their earlier approved references if accessible or require separate visual approval.

## Shared rules for every route

- The two themes use the same URL/semantic route, canonical book/edition/person records, cloud-backed member state, capabilities and authorisation. Switching themes changes **presentation**, never ownership, moderation, permissions, database relationships or reading progress.
- Each theme gets its own page-level layout, components, information hierarchy and responsive strategy. Sharing API fetching, hooks, types, business logic, validation and server actions is required; duplicating data stores or producing only colour-swapped DOM is forbidden.
- Never render sample books, fabricated reading totals, pretend article feeds, mock authors or fake ratings in production. Render verified live content or a polished, honest empty state.
- The website **admin** has its own design system and remains independent of both themes.

## Route-by-route layout contract

| Page / routes | Editorial — required spatial structure | Reading Room — required spatial structure | Shared behaviour |
|---|---|---|---|
| **Home** `/` | Horizontal nav. New member: left sage bookshelf starter / centre serif welcome / right taste-and-people panel, then recommendation and review rows. Returning: welcome-back band, main-column progress, yearly inset, personalised recommendations, saved next read, review strip. | Left desktop sidebar. New member: prominent green welcome/first-book hero plus recommendation shelf. Returning: compact welcome, stat-card row, current-reading card and saved-next-book card, later discovery. | Real new/returning state, live member bookshelf and recommendations, honest empty states. **Four approved states** described in master contract. |
| **Discover, search** `/books`, `/search`, `/recommendations` | Editorial catalogue: serif lead, airy category/genre navigation, spacious cover-forward rows and carefully separated search/filter sections. | Search workspace: top-level query/filter controls, responsive sidebar/filter drawer, dense yet readable result cards, favourites and smart next-step modules. | Same search API, pagination, filters, ISBN/edition identity, rights-safe covers, missing-book request path. |
| **Book overview** `/book/:id` | Magazine hero featuring real cover and literary metadata; prominent synopsis, edition chooser, readable review list and related works in editorial columns. | Product-like reader workspace with cover/edition summary and compact actionable panels, tabs/sections for editions, details, reviews and shelf actions. | Same canonical work ID, edition identifiers, authors, ratings and moderation; no speculative or placeholder metadata. |
| **Edition and audiobook** within book detail | Distinct reading/listening editions in carefully typeset metadata sections; audiobook narrator credits and duration displayed where verified. | Edition compare/select cards, audio-specific badges, available narration and edition metadata as compact modules. | Never infer ISBN, narrator, duration or availability; audio rating is separate from story rating. |
| **Authors / narrators** `/authors`, `/narrators`, `/person/:id` | Editorial portrait/biography feature, elegant bibliography, editions and interviews where actually available. | People directory with searchable cards, side/profile panels, sortable bibliography, format-specific narration areas. | Single canonical person identity, linked works/recordings, no duplicates or guessed portraits. |
| **Series** `/series`, `/series/:id` | Reading-order magazine guide with numbered book sequence and spacious linked covers. | Practical series tracker / ordered list with compact edition and shelf actions. | Same verified sequence/series records and membership; do not invent series order. |
| **My Bookshelf** `/shelf` | Personal library with editorial shelf sections and cover-focused visual grouping; clear reading-status navigation and private-note sections. | Organised bookshelf workspace with status filters, progress-heavy cards and quick resume/update controls. | Same private shelf IDs, selected editions, statuses, saved dates, progress and privacy. |
| **Add a book** `/add-book` | Guided magazine-like search → edition → reading status flow with clear headings and cover preview. | Step-focused task workspace with compact search/result cards, edition selector and prominent save action. | Same validation, canonical work IDs and edition choices; no fabricated books. |
| **Progress and private thoughts** within shelf | Editorial reading journal/personal note pane with large writing area and understated progress controls. | Inline progress controls or focused drawer/modal with operational fields and clear save state. | Same persistence, progress unit, error handling, privacy restrictions. |
| **Reviews** `/reviews`, `/review/:id`, `/my-reviews` | Publication-style review leads and article typography; covers as supporting editorial media; long-form reading layout. | Review feed/workspace cards, readable rating breakdown, discussion/actions in secondary panels. | Same review visibility, spoiler treatment, story/audio ratings, ownership and moderation. |
| **Write / preview / publish review** `/write-review` and review flows | Generous writing canvas, editorial preview typesetting and explicit publish status. | Focused review composer with structured fields, side-by-side preview at wide sizes and step confirmation. | No auto-publication, private drafts remain private, identical review policy. |
| **Community** `/community`, `/discussions`, threads | Literary community digest: highlighted conversations, thematic editorial sections and clear long-form thread reading. | Community hub/dashboard: discussion-list cards, topic filters, activity grouping and compact thread metadata. | Same posts, members, permissions, safety and moderation; no fake discussion activity. |
| **Book clubs** `/clubs`, club pages | Curated club feature with cover-led current read and magazine-style updates. | Club workspace with reading schedule, member activity and task-like conversation cards where supported. | Same club memberships, reading choices and access controls. |
| **Challenges** `/challenges`, details | Editorial reading-goal feature with reflective progress, books and reading narrative. | Progress dashboard with measured metrics, checkpoints and concise challenge actions. | Same challenge definition, real measured progress and eligibility. |
| **Member public profile** `/reader/:handle` | Literary portrait/header, curated public writing and graceful review typography. | Profile dashboard showing deliberately public activity and modular published reviews. | Strict public-vs-private fields; never expose private shelf, draft or notes. |
| **My Reading Year** `/reading-year` | Illustrated annual reading essay/summary with editorial stats and readable timeline. | Analytical dashboard cards, reading/activity charts and format breakdowns. | Only computed logged data; no hardcoded totals, formats or dates. |
| **Signup, verification, onboarding** | Follow approved Editorial welcome/verification references and circular author/narrator taste-orbit composition. | Spacious but compact multistep workspace; selected people shown as natural cluster with equivalent labels, counts and removal. | Same auth, recovery, confirmed-email requirements, saved taste selections and accessibility. |
| **Account, preferences** `/account`, `/preferences` | Editorial settings pages with generous grouped form fields and reading taste sections. | Structured settings dashboard with categories, inset profile module and scannable form controls. | Theme preference persisted server-side for verified members; identical account safety controls. |
| **Empty, loading, error and missing content** | Warm typeset explanatory messages, thoughtful whitespace, helpful routes, no fake editorial copy. | Compact and accessible dashboard notices, skeletons/status elements and next-step actions. | No misleading statistics, records or fake successful saves; backend/API failures clearly communicated. |

## Desktop, tablet and mobile breakpoints

**Editorial:** Desktop top nav remains horizontal while space allows; at narrow widths, a clearly labelled menu replaces overflowing links. Editorial multi-column hero and recommendation strips reflow into readable card/list layouts. All primary actions remain accessible and no horizontal scroll is required.

**Reading Room:** Desktop sidebar is a first-class part of the interface. On tablets/mobile, transform it into a discoverable, labelled drawer or intentional compact navigation. The content canvas must take the full available width; no persistent empty sidebar gutter. Dashboard grids reflow to single-column or appropriate two-column sections without truncating book titles, buttons or progress units.

Both: test text enlargement, keyboard and screen-reader labels, focus management for dialogs/drawers, reduced motion, touch targets, good contrast and loading/failure states.

## Reference precedence and acceptance

1. **User-supplied original Editorial homepage screenshots (4 Nov 2026):** `Welcome to your reading world(2).png` (new member), `Chapter & Sound Returning Member Homepage(2).png` (returning member).
2. **User-approved Reading Room mockup (4 Nov 2026):** lower-left new-member and lower-right returning-member portions of the four-state comparison image. These establish a design direction; a direct screenshot comparison requires the actual file.
3. Earlier user-approved screenshots for other pages remain applicable unless subsequently replaced or explicitly superseded.
4. **Do not use:** any earlier rejected generic mockups, a separate Reading Room/Editorial “section” interpretation, or shared-page colour swapping.

**Acceptance for an implemented page:** a visually reviewed rendered desktop screenshot, mobile/tablet pass, correct semantic route and member-state parity, correct cloud data, and working interactions. An approved design concept is not evidence of an implemented page.

## Rollout and source-of-truth maintenance

1. Align the existing Editorial new/returning homepage with its supplied original references.
2. Implement/align the distinct Reading Room new/returning home in the existing app without changing live data paths.
3. Apply this matrix page by page, keeping functionality intact; validate one theme and its paired counterpart before claiming both delivered.
4. When a future mockup is explicitly approved, update this matrix and master contract in the same change; identify what older layout it supersedes.
5. Ensure every new UI task links to **both this matrix and the master contract**. Old docs, sample components or generated designs cannot silently override them.

**Status at lock:** requirements committed; website implementation and visual audit remain separate work.
