# Offline rehearsal. NO remote queries, NO production writes, NO Cloudflare secrets.
# The existing BOOK_DB export and prepared plan are used unchanged.
param(
 [int]$Limit = 30,
 [switch]$All,
 [switch]$Resume
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$latest = Get-ChildItem ".private-catalogue-5000\snapshots\book-db-before-import-*.sql" -ErrorAction Stop |
 Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { throw "No saved BOOK_DB snapshot found. Refusing remote access." }
$plan = ".private-catalogue-5000\import-plan"
$out = ".private-catalogue-5000\import-plan\rehearsal"
$flags = @("--plan", $plan, "--snapshot", $latest.FullName, "--out", $out)
if ($All) { $flags += "--all" } else { $flags += @("--limit", [string]$Limit) }
if ($Resume) { $flags += "--resume" }
Write-Host "Running OFFLINE catalogue rehearsal against $($latest.Name)"
& npx --no-install tsx scripts/rehearse-catalogue-bulk-import.ts @flags
if ($LASTEXITCODE -ne 0) { throw "Rehearsal failed. Production database was not modified." }
Write-Host "Read results at $out\report.json (production writes: 0)"
