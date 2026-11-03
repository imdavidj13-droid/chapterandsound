# Live Cloudflare signup + administrator activation
**Development status:** Code preparation only; production services and account activation are not yet complete.

## 1. Prerequisites

- Cloudflare Worker connected to GitHub `imdavidj13-droid/chapterandsound`.
- A dedicated D1 database for Chapter & Sound (**never** reuse another project's DB).
- A public HTTPS Worker/domain URL used consistently as `PUBLIC_ORIGIN`.
- A verified mail-sending domain and valid Resend API key with sender address.
- A randomly generated `BETTER_AUTH_SECRET` at least 32 characters long.

The intended bootstrap address is configured in `wrangler.jsonc` as **`ADMIN_EMAIL=imdavidj13@gmail.com`**. The site owner still must complete actual email verification. Typing that address into a form does not produce administrator permissions.

## 2. Database binding and migrations

From the repository root on Windows PowerShell:

```powershell
npm install
npx wrangler login
npx wrangler d1 create chapterandsound-db
```

Copy the returned **new** database ID into the `d1_databases` binding in `wrangler.jsonc`:

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "chapterandsound-db",
  "database_id": "<NEW_D1_UUID>"
}]
```

First validate the migrations using an isolated disposable staging database. After backing up any existing production D1 database and confirming the staging migration, apply:

```powershell
npx wrangler d1 migrations apply DB --remote
```

The ordered migrations are `0000_auth.sql`, `0001_catalogue.sql`, `0002_community.sql`, `0003_review_moderation.sql`, `0004_moderation_roles.sql`, `0005_reader_profiles.sql`, `0006_member_themes.sql`.

**Auth schema verification required:** compare the installed Better Auth 1.7.15 core schema against `0000_auth.sql` using Better Auth's schema checker before any live account data is written; ensure all generated/default types match Cloudflare D1. The application's separate plural `members` table is never treated as Better Auth's `user` table.

## 3. Required Cloudflare environment

Set `PUBLIC_ORIGIN` to the precise public HTTPS URL, with **no trailing slash**, e.g. `https://<your-subdomain>.workers.dev`. Set `MAIL_FROM` to a verified sender identity at a domain you control.

Configure `PUBLIC_ORIGIN` and `MAIL_FROM` as Worker variables and `BETTER_AUTH_SECRET` and `MAIL_API_KEY` as Worker secrets. Example CLI commands for secrets:

```powershell
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put MAIL_API_KEY
```

Enter values through the CLI prompt; do not commit keys, passwords or tokens to the repository. You can generate a secret locally in PowerShell with:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Do not copy/paste that value into chat.

Cloudflare **Build** environment variables are not necessarily the same as Worker **runtime** secrets and vars. Verify the deployed Worker has the binding and runtime values.

## 4. Administrator activation

1. Visit `/signup` on the deployed site, register with `imdavidj13@gmail.com`, choose a strong password and agree to the real published policies.
2. Open the real email from the configured sender. Follow the verification link. Never skip verification.
3. Better Auth creates a verified session; the app's `/api/me` endpoint matches the **verified** session email to the configured `ADMIN_EMAIL`, upserts the user's server-only `site_roles` row with `admin`, and returns `role: 'admin'`.
4. `/account` exposes the administration link for that role. `/admin` and moderation operations continue to enforce authorisation on the server.
5. Ordinary accounts, unverified mailboxes and arbitrary request bodies cannot grant themselves this role.

## 5. Must-pass live smoke tests

- Signup sends real mail; unsigned/unverified sessions cannot access member API or `/admin`.
- Wrong password fails; correct password signs in, sessions persist, logout invalidates the cookie.
- Expired/invalid verification URLs are handled and allow a safe resend.
- Password reset sends a valid link and old credentials are invalidated as expected.
- Verified owner gets `admin`, other verified users do **not**.
- An ordinary member cannot fetch the moderation queue, hide a review or assign roles.
- The owner retains exactly one account across both themes, and appearance preference survives sign-out/new-device sign-in.
- Cover/image rights and legal pages are final before enabling general public registrations.
- Test email-change and deleted-account edge cases before production launch.

## 6. Full administrative backend — subsequent work

The next administration phase should have its own protected routes and API scopes for:
dashboard, members/roles, review moderation, reports, books/editions, authors/narrators, image rights/R2, categories/tags, homepage curation, challenges, clubs, announcements, website settings, and audit history. High-risk edits require explicit confirmation, server-side role checks and structured audit logging. Work on the control panel begins only after a verified owner account can sign in successfully.

The present `/admin` route is a **moderation foundation**, not the complete admin console.
