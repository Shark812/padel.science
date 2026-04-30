# Padel Data Pipeline

Pipeline locale per:
- crawl incrementale di più portali di racchette da padel
- normalizzazione e unificazione dei modelli
- caricamento in PostgreSQL locale
- controllo schedulato giornaliero su Windows

## Struttura

- `scripts/`: scraper, unificazione, pipeline e job schedulati
- `db/`: schema e SQL di refresh
- `data/`: output generati localmente, non versionati
- `docker-compose.yml`: PostgreSQL locale

## Fonti attuali

- `padelreference`
- `extreme-tennis`
- `padelful`
- `pala-hack`
- `padelzoom`

## Requisiti

- Windows con PowerShell
- Python 3
- Docker Desktop

## Setup locale

1. Avvia PostgreSQL locale:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_local_postgres.ps1
```

2. Esegui un refresh del DB dal dataset unificato corrente:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\refresh_local_postgres.ps1
```

## Comandi principali

Crawl completo:

```powershell
python .\scripts\run_daily_pipeline.py
```

Crawl incrementale:

```powershell
python .\scripts\run_incremental_pipeline.py
```

Ricostruzione dataset unificato:

```powershell
python .\scripts\build_unified_rackets.py
```

Job notturno manuale:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_midnight_job.ps1
```

Registrazione Scheduled Task Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\register_midnight_task.ps1
```

## Output locali

Gli output vengono salvati in `data/` e non sono tracciati da Git:
- dataset per singola fonte
- dataset unificato
- log e report dei job
- stato incrementale degli URL già visti

## Database locale

Configurazione corrente:
- host: `localhost`
- port: `5432`
- database: `padel`
- user: `padel`
- password: `padel`

Tabelle principali:
- `app.brands`
- `app.rackets`
- `app.racket_sources`

## Note operative

- Il job di mezzanotte usa la pipeline incrementale.
- Se non trova nuovi URL prodotto, salta unificazione e refresh del DB.
- L'approccio incrementale è pensato per intercettare nuovi modelli; non rileva automaticamente cambi ai contenuti di URL già noti.
