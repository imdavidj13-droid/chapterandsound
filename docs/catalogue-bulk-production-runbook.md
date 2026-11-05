# Chapter & Sound: first bulk production import runbook

## Status and safeguards

The offline rehearsal of the first batch tested **4,441** import candidates:
**4,433** passed (565 edition-backed and 3,868 work-only); **8** remain
held for ambiguous canonical author identities. The original 4,976 candidates
also include **535** candidates held earlier for source/edition conflicts.

Do NOT import the held records. Do NOT regard this rehearsal as proof that
the remote production database still matches its November 5 snapshot.

All tools added here default to **read-only**, and work-only production imports
are additionally controlled by the Worker environment variable
`CATALOGUE_WORK_ONLY_IMPORT_ENABLED` (unset by default). Never enable it
without verifying migrations, tests, provenance rights and a post-write audit.

## Step 1 — Tests

From `C:\Projects\chapterandsound`:

```powershell
git pull --ff-only origin main
npm run typecheck
npm test
python -m unittest discover -s tests -p "test_plan_openlibrary_bulk_import.py"
python -m unittest discover -s tests -p "test_verify_catalogue_production_preflight.py"
```

If any test fails, STOP. Do not enable write flags or attempt production execution.

## Step 2 — Fresh remote export and read-only preflight

```powershell
.\scripts\preflight-first-5000.ps1
```

This requests a **fresh export of BOOK_DB**. Cloudflare warns D1 may be
temporarily unavailable while exporting. The script does NOT write to BOOK_DB.
It compares the immutable rehearsal checkpoint and current import plan against
that new snapshot and saves:

- `.private-catalogue-5000/production-preflight/report.json`
- `.private-catalogue-5000/production-preflight/eligible.json` (hash bound)
- `.private-catalogue-5000/production-preflight/withheld.json`

A record only becomes eligible if it passed offline rehearsal AND still
passes the source-identity, duplicate and ISBN checks against the fresh
database. All eight author-identity holds remain withheld.

## Step 3 — Preview the production runner (NO network or database writes)

```powershell
npx --no-install tsx scripts/execute-catalogue-production-import.ts
```

The runner checks the preflight digest, candidate keys and freshness, then
prints the eligible count. This is not the import.

## Step 4 — Controlled execution (separate explicit owner approval needed)

There is intentionally NO production import command in the normal workflow.
Before starting, verify a recent backup, the current deployed Worker revision,
the owner-only route, the edition/write rights, environment feature flags, and
the checksum of the preflight results. Obtain explicit approval for a **single
private-draft canary import**; take a fresh backup and verify before proceeding
beyond it.

The runner's write mode requires all of these:

- `--execute` and `--confirm IMPORT_PRIVATE_DRAFTS`
- `--origin https://chapterandsound.imdavidj13.workers.dev`
- A private, short-lived `CATALOGUE_ADMIN_COOKIE` environment variable, **never
  saved in files, logs, source control or chat**
- A recent read-only preflight bound to this exact plan
- A maximum of 1–10 records per invocation
- The deployed production endpoint must be configured and allow the operation

The runner stops after a failed/uncertain API response; do not blindly retry a
failed request, since a timeout may occur after a transaction committed. Review
fresh remote audit records and reconcile the checkpoint first. A successful
response only indicates a private draft; no publication is attempted.

## Step 5 — Verify every canary against a fresh export

Compare count changes and audit provenance in WORKS, PEOPLE, CONTRIBUTIONS,
EDITIONS, identifiers and catalogue_audit_log. Verify no duplicated ISBNs,
no duplicate canonical author identities, and status='draft'. Only after these
checks should the next small batch be approved.

## Scope

This is a **guarded import infrastructure**, not an automatically executed
4,433-record production import. The owner must control when production writes
begin. Cover/page-count and other metadata enrichment is the subsequent stage.
