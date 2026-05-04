$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

$composeFile = Join-Path $root "docker-compose.yml"
cmd /c "docker compose -f ""$composeFile"" up -d postgres >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start postgres container."
}

for ($i = 0; $i -lt 30; $i++) {
    $ready = docker exec padel-postgres pg_isready -U padel -d padel 2>$null
    if ($LASTEXITCODE -eq 0) {
        break
    }
    Start-Sleep -Seconds 2
}

cmd /c "docker exec -i padel-postgres psql -U padel -d padel -f /workspace/db/init/001_schema.sql"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to apply PostgreSQL schema."
}

cmd /c "docker exec -i padel-postgres psql -U padel -d padel -f /workspace/db/sql/refresh_unified.sql"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to refresh PostgreSQL from unified dataset."
}

Write-Output "Seeding official brand domains."
node (Join-Path $root "scripts\seed_brand_official_domains.js")
if ($LASTEXITCODE -ne 0) {
    throw "Failed to seed official brand domains."
}

Write-Output "Enriching missing racket years from source pages and official domains."
node (Join-Path $root "scripts\enrich_missing_years.js") --limit 500 --sleep-ms 40 --min-confidence 70 --apply
if ($LASTEXITCODE -ne 0) {
    throw "Failed to enrich missing racket years."
}

Write-Output "Local PostgreSQL refreshed from unified-rackets.csv"
