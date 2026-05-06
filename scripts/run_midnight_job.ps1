$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dataDir = Join-Path $root "data"
$jobDir = Join-Path $dataDir "job-runs"
$snapshotDir = Join-Path $jobDir "snapshots"
$reportDir = Join-Path $jobDir "reports"
$logDir = Join-Path $jobDir "logs"

New-Item -ItemType Directory -Force -Path $jobDir, $snapshotDir, $reportDir, $logDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logPath = Join-Path $logDir "run_$timestamp.log"
$latestSnapshot = Join-Path $snapshotDir "latest-unified-rackets.csv"
$tempBeforeSnapshot = Join-Path $snapshotDir "before_$timestamp.csv"
$currentUnified = Join-Path $dataDir "unified-rackets\unified-rackets.csv"
$incrementalReport = Join-Path $dataDir "source-state\latest-incremental-report.json"
$latestReport = Join-Path $reportDir "latest-report.json"
$timestampedReport = Join-Path $reportDir "report_$timestamp.json"

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    $line | Tee-Object -FilePath $logPath -Append
}

function Ensure-Docker {
    try {
        docker info *> $null
        Write-Log "Docker is already available."
        return
    }
    catch {
        Write-Log "Docker is not ready. Starting Docker Desktop."
        Start-Process -FilePath "C:\Program Files\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 5
            try {
                docker info *> $null
                Write-Log "Docker became available."
                return
            }
            catch {
            }
        }
        throw "Docker Desktop did not become ready in time."
    }
}

try {
    Write-Log "Midnight job started."

    if (Test-Path $latestSnapshot) {
        Copy-Item $latestSnapshot $tempBeforeSnapshot -Force
        Write-Log "Copied previous snapshot to $tempBeforeSnapshot"
    }
    else {
        Write-Log "No previous snapshot found. This run will establish the baseline."
    }

    Ensure-Docker

    Write-Log "Running incremental crawl + unify pipeline."
    $incrementalScript = Join-Path $root "scripts\run_incremental_pipeline.py"
    $incrementalOutput = cmd /c "python ""$incrementalScript"" 2>&1"
    $incrementalExitCode = $LASTEXITCODE
    $incrementalOutput | Tee-Object -FilePath $logPath -Append
    if ($incrementalExitCode -ne 0) {
        throw "Incremental pipeline failed with exit code $incrementalExitCode. See $logPath for full output."
    }

    if (-not (Test-Path $incrementalReport)) {
        throw "Incremental report not found after pipeline run: $incrementalReport"
    }

    $incremental = Get-Content -Path $incrementalReport -Raw | ConvertFrom-Json
    Write-Log ("Incremental pipeline summary: added_records_total={0}, did_rebuild_unified={1}" -f $incremental.added_records_total, $incremental.did_rebuild_unified)

    if ([int]$incremental.added_records_total -eq 0) {
        if ((-not (Test-Path $latestSnapshot)) -and (Test-Path $currentUnified)) {
            Copy-Item $currentUnified $latestSnapshot -Force
            Write-Log "No new rackets found. Baseline snapshot created."
        }

        $noChangeReport = [ordered]@{
            before_count = if (Test-Path $latestSnapshot) { (Import-Csv $latestSnapshot).Count } else { 0 }
            after_count = if (Test-Path $currentUnified) { (Import-Csv $currentUnified).Count } else { 0 }
            new_count = 0
            new_models = @()
            skipped_refresh = $true
            reason = "No new racket URLs were discovered across the tracked sources."
            incremental = $incremental
        }
        $json = $noChangeReport | ConvertTo-Json -Depth 8
        Set-Content -Path $latestReport -Value $json -Encoding UTF8
        Set-Content -Path $timestampedReport -Value $json -Encoding UTF8
        Write-Log "No new rackets found. Skipping PostgreSQL refresh and snapshot comparison."
        Write-Log "Midnight job completed successfully."
        exit 0
    }

    Write-Log "Refreshing local PostgreSQL (includes missing-year enrichment step)."
    & (Join-Path $root "scripts\refresh_local_postgres.ps1") 2>&1 | Tee-Object -FilePath $logPath -Append

    if (-not (Test-Path $currentUnified)) {
        throw "Unified CSV not found after pipeline run: $currentUnified"
    }

    Copy-Item $currentUnified $latestSnapshot -Force
    Write-Log "Updated latest snapshot."

    $compareScript = @'
import csv
import json
import sys
from pathlib import Path

before_path = Path(sys.argv[1])
after_path = Path(sys.argv[2])
report_path = Path(sys.argv[3])
timestamped_path = Path(sys.argv[4])

def load_rows(path: Path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))

before_rows = load_rows(before_path)
after_rows = load_rows(after_path)

before_ids = {row["unified_id"] for row in before_rows}
after_ids = {row["unified_id"] for row in after_rows}

new_rows = [
    {
        "unified_id": row["unified_id"],
        "canonical_name": row["canonical_name"],
        "brand": row["brand"],
        "year": row["year"],
        "reliability_score": row["reliability_score"],
        "source_portals": row["source_portals"],
    }
    for row in after_rows
    if row["unified_id"] not in before_ids
]

report = {
    "before_count": len(before_rows),
    "after_count": len(after_rows),
    "new_count": len(new_rows),
    "new_models": new_rows,
}

report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
timestamped_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
'@

    $beforeArg = if (Test-Path $tempBeforeSnapshot) { $tempBeforeSnapshot } else { Join-Path $snapshotDir "missing.csv" }
    $compareScript | python - $beforeArg $currentUnified $latestReport $timestampedReport 2>&1 | Tee-Object -FilePath $logPath -Append

    Write-Log "Midnight job completed successfully."
}
catch {
    Write-Log ("Midnight job failed: " + ($_ | Out-String))
    throw
}
