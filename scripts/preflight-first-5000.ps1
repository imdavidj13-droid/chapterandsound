# Read-only production readiness check for the first 5,000 catalogue works.
# Exports a NEW remote BOOK_DB snapshot and compares it against a completed
# offline rehearsal. This script NEVER imports a book or enables write flags.
param(
 [string]$Rehearsal = ".private-catalogue-5000\import-plan\rehearsal-v3\checkpoint.json",
 [string]$Plan = ".private-catalogue-5000\import-plan",
 [string]$Output = ".private-catalogue-5000\production-preflight"
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$rehearsalPath = (Resolve-Path $Rehearsal -ErrorAction Stop).Path
$planPath = (Resolve-Path $Plan -ErrorAction Stop).Path
$ledger = Get-Content $rehearsalPath -Raw | ConvertFrom-Json
if ($ledger.dryRun -ne $true -or $ledger.productionWrites -ne 0 -or @($ledger.results).Count -ne 4441) {
 throw "Rehearsal checkpoint is not the complete approved 4,441-candidate offline run."
}
$snapshotDir = Join-Path (Get-Location) ".private-catalogue-5000\snapshots"
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
$run = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$snapshot = Join-Path $snapshotDir ("book-db-preflight-" + $run + ".sql")
Write-Host "READ ONLY: export BOOK_DB. Wrangler may temporarily pause D1 queries during export."
Write-Host "No catalogue import, migration, or other remote write will occur."
& npx --no-install wrangler d1 export chapterandsounds-book-db --remote --output $snapshot
if ($LASTEXITCODE -ne 0 -or !(Test-Path $snapshot)) {
 throw "Fresh remote BOOK_DB export failed. No preflight run and no production writes."
}
if ((Get-Item $snapshot).Length -lt 100) { throw "Fresh BOOK_DB export looks incomplete." }
& python scripts/verify-catalogue-production-preflight.py --plan $planPath --rehearsal $rehearsalPath --fresh-db-sql $snapshot --out $Output
if ($LASTEXITCODE -ne 0) { throw "Preflight did not pass. Production imports remain disabled." }
Write-Host "Production imports remain DISABLED. Inspect $Output\report.json"
