# Homepage verification link regression test

The email verification link must target `https://chapterandsound.imdavidj13.workers.dev/#verify-email=...`, never a top-level navigation to `/api/auth/verify-email`. The already loaded SPA calls Better Auth through a JSON fetch and strips the secret from the visible address bar. This PR runs TypeScript, tests, migrations and production build; it does not verify live mail delivery.
