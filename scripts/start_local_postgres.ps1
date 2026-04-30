$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
docker compose -f "$root\docker-compose.yml" up -d postgres | Out-Host
Write-Output "PostgreSQL is starting on localhost:5432"
Write-Output "Database: padel"
Write-Output "User: padel"
Write-Output "Password: padel"
