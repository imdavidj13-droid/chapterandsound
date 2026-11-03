# Full backend admin control panel — after verified-owner signup
**Owner:** Verified Better Auth account matching configured `ADMIN_EMAIL` (`imdavidj13@gmail.com`).
**Status (3 November 2026):** A distinct, owner-protected administration console has been implemented and passed TypeScript, unit tests, SQLite migration checks and production build. Production rollout requires applying migration `0008_admin_console.sql` and redeploying the Worker. Its live backend currently supports:

- Dashboard of actual D1 counts and operational readiness.
- Read-only member directory with verified state, roles and aggregate counts; no private notes exposed.
- Book creation (unverified), work and edition verification status management, edition creation, contributor creation and biography editing.
- Review listing with reason-required removal; moderation report queue.
- Community listing, closing/reopening discussions and changing challenge visibility.
- Missing-book request state management; draft/publish/archive editorial announcements.
- Homepage heading/intro and guest-default-theme settings; current live settings readback.
- Administrator audit log and change tracing.
- Independent responsive admin navigation, outside both public themes.
- Session/theme first-paint gating to avoid transient signed-out content and wrong-theme render on reload.

**Not yet implemented:** self-service member suspension/unban, full work/edition relationship editors and merge tools, complete contributor relationship editing, R2 image uploads/rights editor, staff role delegation, transactional/idempotent audit failure recovery, bulk data operations and external metadata import workflows. These remain explicit delivery work, not active controls. The external catalogue import phase remains last.

## Layout and access
- Own responsive admin shell and navigation, separate from public Editorial / Reading Room themes.
- Entry point `/admin` only visible to verified role holders; every Worker mutation requires authorisation regardless of UI.
- Roles: site owner/admin, optional moderator, ordinary verified member. No privilege assignment through registration input.
- Admin dashboard: actual account counts, publishing, review/abuse queue, unverified book entries, email-service health, import health, storage and Worker errors.
- Clear staging vs production indicators; destructive changes require explicit confirmation and audit log.

## Management modules

1. **Members & accounts:** search, verified status, suspensions, profile moderation, safe deletion/export requests, last known activity (no private shelf details exposed by default), permission changes via dedicated elevated workflow and audit records.
2. **Books / works / editions:** find/merge work candidates, assign verified metadata, separate print/ebook/audio editions, narrator relationships, series order, revision history, admin overrides and missing-book request queue. All changes maintain provenance.
3. **Authors & narrators:** canonical profiles, photos with permissions/credits, alias links, contributor relationships and biography moderation; guard against incorrect identity merges.
4. **Reviews & community:** reported reviews, spoiler labels, helpful abuse, discussions/replies, clubs, reading challenges, recommendation posts, temporary hides, reason codes, appeals and moderator notes.
5. **Editorial CMS:** homepage slots, announcement banners, Featured selections, seasonal collections, community highlights and schedules. Show preview and publish statuses; never replace member contributions with fake content.
6. **Images / R2:** upload and replace permitted media, crop/focal point, source attribution, rights/expiry flags, broken-link checks, access restrictions and cleanup of orphan assets.
7. **Site settings:** available themes, default for guests, system maintenance notice, public signup opening/closing, review moderation parameters, categories/genre taxonomy, outbound mail sender health and safe feature flags.
8. **Catalog integration (last):** external source credentials, import queue and retries, match decisions, provenance, human review queue, fail-safe collision detection, provider quotas/usage and schedule controls.
9. **Observability:** Worker errors and request rate metrics, D1 health, migration version, health checks, jobs, notifications, backup/recovery runbooks and outgoing mail failures.
10. **Audit/security centre:** role changes, content deletes/edits, authentication anomalies, moderation decisions and sensitive settings with actor ID, timestamp, target and reason.

## Required safety standards
- All write operations checked in the Worker; admin APIs never trust client-supplied role/email/actor ID.
- Consistent pagination, validation, idempotency, rate limiting, CSRF/origin protections, optimistic concurrency and audit logging.
- Use database transactions/batches where supported for multi-step writes; provide recovery procedure for partial failures.
- Protect private member bookshelf, reading notes, preferences and reading history; do not reveal them as general admin browsing content.
- Test permission matrix: anonymous/member/moderator/admin; no unauthorized data exposure or cross-user updates.
- Desktop-first productivity with full mobile operability and clear confirmation dialogs.
- Implement real data integrations; no fake counts, users or sample reviews in production admin views.
- Production database is never overwritten by disposable test data.

## Order of work
1. Fully implement and visually verify the two public themes.
2. Connect D1 + Better Auth + outbound verified email, then verify signup, login, reset, logout and account persistence.
3. Confirm the intended owner's mailbox is verified and that only its account receives admin.
4. Implement the full admin console modules and their end-to-end permission tests.
5. Finish external catalogue enrichment/import integration last, as directed.
