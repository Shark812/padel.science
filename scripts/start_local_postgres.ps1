$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root "docker-compose.yml"
cmd /c "docker compose -f ""$composeFile"" up -d postgres >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start postgres container."
}
Write-Output "PostgreSQL is starting on localhost:5432"
Write-Output "Database: padel"
Write-Output "User: padel"
Write-Output "Password: padel"
