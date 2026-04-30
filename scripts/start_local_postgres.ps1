$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
docker compose -f "$root\docker-compose.yml" up -d postgres 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start postgres container."
}
Write-Output "PostgreSQL is starting on localhost:5432"
Write-Output "Database: padel"
Write-Output "User: padel"
Write-Output "Password: padel"
