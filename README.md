# Chapter & Sound

A community website for readers and audiobook listeners — paperback, hardback, ebook and audio. **Website-first priority**: implement public and member experiences before completing catalogue-provider integration.

## Repository status

This repository includes a responsive Editorial React website, initial route structure, Cloudflare Worker read API and draft D1 schema for member activity, reviews, discussions, clubs, recommendations and challenges. The current UI shows honest empty states. **The project is not finished or deployed.** In particular, sign-up, sign-in, review publishing and private reading updates are blocked until verified server authentication and cloud persistence are wired. No demo content is passed off as real.

## Run locally (PowerShell)

```powershell
git clone https://github.com/imdavidj13-droid/chapterandsound.git
cd chapterandsound
npm install
npm run typecheck
npm test
npm run dev
```

Open the localhost URL shown by Vite. Previewing does not create accounts or write production data. The Worker health route reports when a D1 database is not configured.

## Roadmap

1. Implement the complete approved Editorial user journey: accounts/verification, onboarding, book add and edition selection, private shelf/progress/thoughts, review draft/preview/publish, community interactions, public profiles, personal Wrapped and admin.
2. Wire every persistent action to D1 with session-based owner checks, moderation, image permissions and email delivery.
3. Implement and audit the full multi-provider catalogue pipeline last, before publishing real book content.
4. Test visual references and all responsive paths; then review deployment.

See [docs/WEBSITE_PLAN.md](docs/WEBSITE_PLAN.md) for the implementation checklist. No paid services or deployment are authorised.

## Architecture

- React 19 + TypeScript + Vite, Cloudflare Worker runtime.
- Cloudflare D1 migrations define the data relationships; no production DB has yet been provisioned.
- The default style is Editorial (ivory, burgundy and restrained sage). Future Reading Room style must be a separate layout/theme, not a colour-only toggle.
- Member notes, drafts and reading records are private. Public reviews require deliberate publication.
- Book/author/narrator data must be verified and sourced rather than generated.

For this phase, the catalogue benchmark files are exploratory only and should not block website work.
