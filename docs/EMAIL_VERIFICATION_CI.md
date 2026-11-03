# Email verification handoff validation

Verifies the `/confirm-email#token=...` route and legacy SPA interception fallback for `/api/auth/verify-email?token=...`. Tokens are removed from the browser URL, and the client makes a same-origin API request without a callback redirect.

This is build/test verification only, not proof of live email verification. Do not include tokens in logs or screenshots.
