$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

docker compose -f "$root\docker-compose.yml" up -d postgres *> $null
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

docker exec -i padel-postgres psql -U padel -d padel -f /workspace/db/sql/refresh_unified.sql 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Failed to refresh PostgreSQL from unified dataset."
}

Write-Output "Local PostgreSQL refreshed from unified-rackets.csv"
