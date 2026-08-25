# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A fitness analytics app for Norwegian Method endurance training, deployed at **dataandmiles.com**. Ingests workout data from COROS devices and computes training-specific metrics around heart-rate zones (LT1/LT2 thresholds).

## Setup & Running

This project uses `uv` for Python dependency management.

```bash
uv sync          # install dependencies
uv add <pkg>     # add a dependency
```

Python version: 3.11 (pinned in `.python-version`).

### Start all services

```bash
docker compose up -d                                          # PostgreSQL
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000       # FastAPI backend
cd frontend && npm run dev                                    # Next.js (http://localhost:3000)
```

The frontend proxies all `/api/*` requests to `localhost:8000` via Next.js rewrites, **except** `/api/import/fit/upload` which uses a Route Handler (`frontend/app/api/import/fit/upload/route.ts`) to stream multipart bodies directly to FastAPI, bypassing the proxy body-size limit.

## Architecture

```
[COROS Cloud] ──(Daily Cron / Manual Upload / MCP Server)──> [FastAPI Backend] ──> [Calculations Engine]
                                                                      │                      │
                                                                      ▼                      ▼
[Next.js Frontend] <──(JSON REST API)──────────────────────── [PostgreSQL] <──── [Normalized Tables]
```

- **Backend**: FastAPI (Python) · `app/` · APScheduler cron at 09:00 Europe/Rome
- **Database**: PostgreSQL in Docker · schema managed manually (no Alembic)
- **Frontend**: Next.js 16 (App Router) + Tailwind v4 + Recharts v3 · `frontend/`
- **Data source**: COROS wearable via MCP stdio client (`app/services/coros_client.py`) or manual `.fit` upload

## Domain: Norwegian Method Training Zones

| Zone | Range | Description |
|---|---|---|
| Zone 1 | < LT1 | Easy aerobic base |
| Zone 2 | LT1 – LT2 | Threshold sweet spot |
| Zone 3 | > LT2 | VO2max / high intensity |

LT1 ≈ LT2 × 0.88 (configurable via `athlete_profile`). Zone seconds are computed per-second from HR stream during `.fit` import.

## Backend Structure (`app/`)

| Path | Purpose |
|---|---|
| `main.py` | FastAPI app, lifespan, CORS, router mounting |
| `models.py` | SQLAlchemy async ORM for all tables |
| `config.py` | Pydantic settings from `.env` |
| `scheduler.py` | APScheduler daily sync job |
| `routers/auth.py` | `POST /api/auth/login` — multi-user, checks owner + coach credentials from `.env` |
| `routers/dashboard.py` | summary, intensity-distribution, hrv-load, hrv-rolling, sleep-stats, readiness, zone2-trend |
| `routers/activities.py` | list (optional `since` filter), detail, count, PATCH lactate, daily-distance |
| `routers/sync.py` | trigger/status for Coros sync |
| `routers/fit_import.py` | trigger (directory), upload (multipart), status |
| `routers/recalculate.py` | trigger/status — re-derives zones & pct_of_hr_max from stored JSONB streams |
| `routers/athlete.py` | GET/PUT athlete profile singleton |
| `services/coros_client.py` | MCP stdio client wrapping `coros-mcp serve` |
| `services/ingestion.py` | `run_sync()` — pulls daily metrics, sleep, activities from Coros |
| `services/fit_importer.py` | Batch `.fit` import with zone calculation |
| `services/recalculator.py` | `run_recalculate()` — reads `activity_time_series.stream_data`, applies current profile thresholds, batch-updates `activity_summaries` |
| `services/athlete.py` | `effective_lt2_hr()`, `effective_lt1_hr()` — profile > `.env` fallback |

**Route ordering matters**: in `activities.py`, `/daily-distance` and `/count` must be declared before `/{activity_id}` to avoid the path parameter matching them.

## Database Schema

Schema changes require manual `ALTER TABLE` on the Docker container:
```bash
docker exec coros_postgres psql -U groggero -d data_and_miles -c "ALTER TABLE ..."
```

### `daily_metrics`
`date` (PK) · `resting_heart_rate` · `hrv_baseline` · `hrv_today` · `training_load` · `training_load_ratio` · `tired_rate` · `vo2max` · `lactate_threshold_hr`

### `sleep_records`
`date` (PK, FK → daily_metrics) · `total_duration_mins` · `deep_mins` · `rem_mins` · `quality_score`

> `quality_score` is always NULL — Coros MCP does not expose it. All sleep metrics use `total_duration_mins` (converted to hours).

### `activity_summaries`
`activity_id` (PK) · `date` · `start_time` · `duration_seconds` · `distance_meters` · `avg_hr` · `max_hr` · `pct_of_hr_max` · `avg_power` · `normalized_power` · `avg_cadence` · `avg_stride_length` · `ground_time` · `stride_height` · `stride_ratio` · `total_ascent` · `total_descent` · `vertical_speed` · `zone1_secs` · `zone2_secs` · `zone3_secs` · `lactate_1_mmol`…`lactate_5_mmol` · `lactate_1_notes`…`lactate_5_notes`

> `is_double_threshold` was **removed** in Session 3.

### `activity_time_series`
`activity_id` (PK, FK → activity_summaries) · `stream_data` (JSONB)

```json
{
  "timestamps": [1149438956, 1149438957],
  "heart_rate": [129, 130],
  "power": [317, 320],
  "speed": [12.521, 12.550],
  "effort_pace": [4.155, 4.150],
  "lat_long": [[51.24101, 6.78426]]
}
```

### `athlete_profile`
Singleton row (`id = 1`, enforced by CHECK constraint). `max_hr` · `resting_hr` · `lt1_hr` · `lt2_hr` · `lt1_lthr_ratio` · `lt1_pace_sec_km` · `lt2_pace_sec_km` · `ftp_watts` · `weekly_zone2_target_mins` · `date_of_birth` · `gender` · `height_cm` · `weight_kg` · `updated_at`

> Fill in `lt2_hr` and `max_hr` before running `.fit` imports to get correct zone calculations.

## Frontend Structure (`frontend/`)

| Path | Purpose |
|---|---|
| `app/layout.tsx` | Root layout with `suppressHydrationWarning` |
| `app/login/page.tsx` | Auth card, credentials from `.env.local` |
| `app/dashboard/page.tsx` | Main dashboard — all data fetched in parallel via `Promise.all` |
| `app/advanced-metrics/page.tsx` | Paginated activity table with inline lactate entry |
| `app/athlete-settings/page.tsx` | Athlete profile settings (5 grouped cards) |
| `app/api/import/fit/upload/route.ts` | Route Handler streaming large `.fit` uploads to FastAPI |
| `lib/api.ts` | All typed fetch functions and interfaces |
| `components/KpiCards.tsx` | WeeklyThresholdCard, HRVCard, ACWRCard |
| `components/KmDrilldownChart.tsx` | Month → week → day distance drill-down |
| `components/HRVRollingChart.tsx` | μ₇d ±1σ band + CV₇d%, stat badges |
| `components/SleepStatsBox.tsx` | Sleep₁d and Sleep₇d mean, deep%/REM% |
| `components/ReadinessCard.tsx` | Green/yellow/red readiness banner |
| `components/Zone2TrendChart.tsx` | 12-week Z2 volume bars, target reference line, faded current week |
| `components/IntensityDistributionChart.tsx` | Z1/Z2/Z3 stacked bars |
| `components/HRVLoadChart.tsx` | HRV + training load dual-axis |
| `components/ActivityTable.tsx` | Paginated activity list (page/totalPages/onPrev/onNext props) |
| `components/ActivityDetailModal.tsx` | Per-second HR/pace/power charts + GPS route map from JSONB |
| `components/ActivityMap.tsx` | Leaflet map with CartoDB dark tiles; green polyline, start/finish dots |
| `components/NavDrawer.tsx` | Hamburger slide-in with Dashboard / Advanced Metrics / Athlete Profile |
| `components/SyncButton.tsx` | Triggers Coros sync, polls status |
| `components/UploadFitButton.tsx` | File picker for `.fit` uploads, polls import status |

All Recharts components are loaded via `dynamic(..., { ssr: false })`.

## Multi-user Auth

Users are defined in `.env` as `COROS_EMAIL`/`COROS_PASSWORD` (owner) and `COACH_USERNAME`/`COACH_PASSWORD`. The `_valid_credentials()` helper in `auth.py` checks all pairs; an empty-string pair is never accepted. To add more users, extend `config.py` with another pair of settings.

## Key Calculations

### HRV Rolling Metrics (backend: `dashboard.py`)
Computed over the last 7 available HRV data points (gaps are skipped — not calendar days):
- **μ₇d** = mean of ln(HRV) over 7 points
- **σ₇d** = sample SD (÷ 6) of ln(HRV)
- **CV₇d** = (σ₇d / μ₇d) × 100 %

### Daily Readiness
Thresholds (constants in `dashboard.py`): `_CV_VOLATILITY_PCT = 10.0`, `_SLEEP_BASELINE_HRS = 7.0`, `_ACUTE_DEFICIT_RATIO = 0.85`
- **Red**: CV₇d > 10% AND Sleep₇d < 7h → cap LT2 volume
- **Yellow**: Sleep₁d < 85% of Sleep₇d → proceed LT1, monitor HR lag
- **Green**: all clear → full double-threshold execution

## Bulk .fit Import

For large historical imports use the directory trigger, not the browser button:
```bash
curl -X POST "http://localhost:8000/api/import/fit/trigger?fit_dir=/absolute/path/to/fit/files"
curl http://localhost:8000/api/import/fit/status   # poll until complete
```

`data_bulk_load/` is gitignored (contains personal `.fit` files).

## Environment & Credentials

- `.env` — DB credentials (gitignored)
- `frontend/.env.local` — Coros login credentials for form prefill (gitignored)
- Never hardcode credentials in committed files
