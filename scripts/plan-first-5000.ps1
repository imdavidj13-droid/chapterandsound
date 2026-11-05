# Build a read-only, identity-aware plan for the prepared Open Library works.
# Exports BOOK_DB to a private local snapshot, but NEVER writes to remote D1.
param(
 [string]$Prepared = ".private-catalogue-5000\prepared",
 [string]$Output = ".private-catalogue-5000\import-plan"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$preparedPath = (Resolve-Path $Prepared -ErrorAction Stop).Path
$run = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$snapshotDir = Join-Path $root ".private-catalogue-5000\snapshots"
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
$snapshot = Join-Path $snapshotDir ("book-db-before-import-" + $run + ".sql")
Write-Host "Exporting BOOK_DB (read only) to $snapshot"
& npx --no-install wrangler d1 export chapterandsounds-book-db --remote --output $snapshot
if ($LASTEXITCODE -ne 0 -or !(Test-Path $snapshot)) { throw "BOOK_DB export failed; no import plan created." }
if ((Get-Item $snapshot).Length -lt 100) { throw "BOOK_DB export looks incomplete." }
Write-Host "Reconciling prepared candidates against the exported canonical database"
& python scripts/plan-openlibrary-bulk-import.py --prepared $preparedPath --db-sql $snapshot --out $Output
if ($LASTEXITCODE -ne 0) { throw "Reconciliation failed; no production writes attempted." }
Write-Host "Read-only import plan generated at $Output\report.json"
Write-Host "Production import remains disabled."
