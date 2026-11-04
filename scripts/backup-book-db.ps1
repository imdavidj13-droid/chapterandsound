# Back up only the canonical BOOK_DB before a reviewed import.
# This script performs no Cloudflare D1 writes.
param(
  [string]$BackupDirectory = ".private-catalogue-backups"
)
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
$destination = Join-Path $project $BackupDirectory
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$target = Join-Path $destination ("chapterandsounds-book-db-" + $stamp + ".sql")
Write-Host "Exporting the canonical BOOK_DB to $target (read-only)"
& npx --no-install wrangler d1 export chapterandsounds-book-db --remote --output $target
if ($LASTEXITCODE -ne 0) { throw "Remote D1 export failed; do not attempt an import." }
if (-not (Test-Path $target)) { throw "No backup was generated; do not attempt an import." }
$file = Get-Item $target
if ($file.Length -lt 100) { throw "Backup file is unexpectedly small; verify manually before importing." }
$hash = Get-FileHash -Path $target -Algorithm SHA256
Write-Host "Backup created: $($file.FullName)"
Write-Host "Size: $($file.Length) bytes"
Write-Host "SHA256: $($hash.Hash)"
Write-Host "The export has not been tested for restoration; confirm its integrity before any production import."
