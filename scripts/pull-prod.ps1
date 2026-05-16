#requires -Version 5.1
<#
.SYNOPSIS
  Mirror the Railway production Postgres into the local Docker Postgres.

.DESCRIPTION
  Dumps the prod DB (via a one-shot postgres:16 docker container so the host
  doesn't need pg_dump), wipes the local DB, restores the dump, then runs
  `prisma migrate deploy` inside the web container so any newer local
  migrations get applied to the restored data.

  PROD IS NEVER WRITTEN TO. This is a read-only pg_dump against prod.

.PARAMETER ProdUrl
  The full Postgres connection string for prod (must include user, password,
  host, port, and sslmode=require). Get it from Railway:
    Project -> Postgres -> Connect tab -> "Public Network" URL.
  Or set $env:PROD_DB_URL once and omit this parameter.

.PARAMETER SkipConfirm
  Skip the "type YES to proceed" prompt. Default: prompt every time.

.EXAMPLE
  $env:PROD_DB_URL = "postgresql://postgres:xxx@xxx.proxy.rlwy.net:1234/railway?sslmode=require"
  .\scripts\pull-prod.ps1
#>

[CmdletBinding()]
param(
  [string]$ProdUrl = $env:PROD_DB_URL,
  [switch]$SkipConfirm
)

$ErrorActionPreference = "Stop"

# Resolve Docker
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
$dockerExe = if ($dockerCmd) { $dockerCmd.Source } else { $null }
if (-not $dockerExe -and (Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe")) {
  $env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
  $dockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
}
if (-not $dockerExe) { throw "docker not found. Install Docker Desktop." }

if (-not $ProdUrl) {
  Write-Error "PROD_DB_URL not set. Get the public URL from Railway dashboard:"
  Write-Error "  Railway -> sparmanikfarm -> Postgres -> Connect -> Public Network"
  Write-Error "Then run: `$env:PROD_DB_URL = '<paste-url-here>'; .\scripts\pull-prod.ps1"
  exit 1
}

if (-not $SkipConfirm) {
  Write-Host ""
  Write-Host "About to:" -ForegroundColor Yellow
  Write-Host "  1. pg_dump from prod (read-only)" -ForegroundColor Gray
  Write-Host "  2. DROP and recreate local 'sparmanik' database" -ForegroundColor Red
  Write-Host "  3. Restore prod dump into local" -ForegroundColor Gray
  Write-Host "  4. Run prisma migrate deploy inside the web container" -ForegroundColor Gray
  Write-Host ""
  $resp = Read-Host "Type YES to proceed"
  if ($resp -ne "YES") { Write-Host "Aborted."; exit 0 }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot "docker-compose.yml"
$dumpFile    = Join-Path $projectRoot "prod-dump.sql"

Write-Host "[1/4] Dumping prod -> $dumpFile" -ForegroundColor Cyan
& docker run --rm -e PGSSLMODE=require postgres:16 `
  pg_dump --no-owner --no-acl --clean --if-exists $ProdUrl `
  | Out-File -Encoding utf8 -FilePath $dumpFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }
$bytes = (Get-Item $dumpFile).Length
Write-Host "  dumped $([math]::Round($bytes/1MB,2)) MB" -ForegroundColor Gray

Write-Host "[2/4] Resetting local DB" -ForegroundColor Cyan
& docker compose -f $composeFile exec -T db `
  psql -U sparmanik -d postgres -c "DROP DATABASE IF EXISTS sparmanik;"
if ($LASTEXITCODE -ne 0) { throw "drop failed" }
& docker compose -f $composeFile exec -T db `
  psql -U sparmanik -d postgres -c "CREATE DATABASE sparmanik;"
if ($LASTEXITCODE -ne 0) { throw "create failed" }

Write-Host "[3/4] Restoring dump" -ForegroundColor Cyan
Get-Content $dumpFile | & docker compose -f $composeFile exec -T db `
  psql -U sparmanik -d sparmanik
if ($LASTEXITCODE -ne 0) { throw "restore failed" }

Write-Host "[4/4] Applying any pending local migrations" -ForegroundColor Cyan
& docker compose -f $composeFile exec -T web npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Warning "migrate deploy reported non-zero - review output" }

Write-Host ""
Write-Host "Done. Local DB now mirrors prod (with any newer migrations applied)." -ForegroundColor Green
Write-Host "Dump kept at: $dumpFile (delete when satisfied)" -ForegroundColor Gray
