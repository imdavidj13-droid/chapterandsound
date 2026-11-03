# Moderation rollout and security

The moderation queue is mounted under `/api/moderation/reports` and the member-facing `/admin` route.

## Readiness and permissions

- Only verified Better Auth session holders with a matching `site_roles` row set to `admin` or `moderator` can view reports or take actions.
- Roles cannot be assigned by public UI, account email or a request parameter.
- No member is granted moderator privileges automatically.
- Only a trusted database operator can grant roles after confirming the correct account ID. Do not take an ID from a user-controlled form.
- Every hide/dismiss action is recorded in `moderation_actions`, alongside the report state change.
- Hiding a review changes its status to `removed` and visibility to `private`. It will stop appearing on the public review endpoint.

## Before enabling on production

1. Configure this project's own D1 database and run migrations in order (`0001`, `0002`, `0003`, `0004`) in a disposable database first.
2. Verify Better Auth migrations and tables in isolation (the application's `members` table is **not** a substitute for Better Auth tables).
3. Configure a valid email service and auth secrets; confirm email verification, sign-in, and session checks.
4. Verify auth/session isolation and run D1 integration tests for reviewer / reporter / moderator roles.
5. Revisit multi-query moderation writes for atomicity where practical, including failure injection and repeat attempts.
6. Grant an initial admin role through a controlled operator operation only.
7. Review legal/privacy/abuse policies before exposing public accounts.

No production D1 migration or role grants were performed by this development work.
