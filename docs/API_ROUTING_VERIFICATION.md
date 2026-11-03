# API routing verification

`wrangler.jsonc` now explicitly prioritises the Worker for `/api/*`, so browser navigation to API URLs returns JSON rather than the single-page application's HTML fallback. The existing SPA route fallback remains enabled for non-API paths. This PR triggers TypeScript, unit, migration and Vite build checks; it does not deploy to Cloudflare.
