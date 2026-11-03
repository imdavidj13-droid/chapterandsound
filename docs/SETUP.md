# Set up on Windows — PowerShell

This is a development-only preview. It does not deploy or create paid services.

1. Open PowerShell in your desired projects folder.
2. Run:
```powershell
git clone https://github.com/imdavidj13-droid/chapterandsound.git
cd chapterandsound
npm install
npm run typecheck
npm test
npm run dev
```
3. Open the URL printed by Vite.

The browser can render the public website while the D1 binding is absent. The banner explains that live data is unavailable. Account creation, personal tracking, publishing and admin changes are deliberately disabled until secure cloud services are configured.

When ready to connect D1, create a **new dedicated database** in Cloudflare, add its binding under `d1_databases` in `wrangler.jsonc`, and apply reviewed migrations to a disposable development DB first. Do not use IDs, tokens or environment variables from previous projects.

Do not run `wrangler deploy` until a production security check and explicit approval. Do not import book imagery without verifying redistribution rights.
