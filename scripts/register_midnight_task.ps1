$ErrorActionPreference = "Stop"

$taskName = "Padel Midnight Pipeline"
$scriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) "scripts\run_midnight_job.ps1"
$command = "powershell.exe -ExecutionPolicy Bypass -File `"$scriptPath`""

schtasks /Create `
  /TN $taskName `
  /TR $command `
  /SC DAILY `
  /ST 00:00 `
  /RL LIMITED `
  /F | Out-Host

schtasks /Query /TN $taskName /V /FO LIST | Out-Host
