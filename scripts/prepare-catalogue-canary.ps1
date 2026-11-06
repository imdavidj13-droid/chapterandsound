# Prepare exactly ONE edition-backed canary from the fresh preflight allowlist.
# Read-only. No cookies, no network, and no production writes.
param(
 [string]$Plan = ".private-catalogue-5000\import-plan",
 [string]$Preflight = ".private-catalogue-5000\production-preflight"
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$manifest = Get-Content (Join-Path $Preflight "eligible.json") -Raw | ConvertFrom-Json
$report = Get-Content (Join-Path $Preflight "report.json") -Raw | ConvertFrom-Json
if ($manifest.dryRun -ne $true -or $manifest.importEnabled -ne $false -or $report.productionWrites -ne 0) {
 throw "Preflight is not an approved read-only manifest."
}
$edition = @($manifest.candidates | Where-Object { $_.kind -eq "edition" } | Select-Object -First 1)
if ($edition.Count -ne 1) { throw "No eligible edition-backed canary candidate found." }
$entry = $edition[0]
$file = Join-Path $Plan $entry.file
$batch = Get-Content $file -Raw | ConvertFrom-Json
$candidate = @($batch.candidates | Where-Object { $_.workSourceKey -eq $entry.workSourceKey })
if ($candidate.Count -ne 1) { throw "Selected canary not uniquely present in source batch." }
Write-Host "ONE-BOOK CANARY (READ ONLY)"
Write-Host "Title: $($candidate[0].title)"
Write-Host "Author: $($candidate[0].author)"
Write-Host "Work source key: $($entry.workSourceKey)"
Write-Host "Edition count: $(@($candidate[0].editions).Count)"
Write-Host "No production write performed."
Write-Host ""
Write-Host "Validate this exact canary against the existing digest-bound preflight:"
& npx --no-install tsx scripts/execute-catalogue-production-import.ts --canary-key $entry.workSourceKey
if ($LASTEXITCODE -ne 0) { throw "Canary preflight runner failed. Do not proceed." }
