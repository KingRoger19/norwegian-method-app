# Norwegian Method Training Analytics

A fitness analytics app for Norwegian Method endurance training, planned for deployment at **dataandmiles.com**. Ingests workout data from COROS devices and computes training-specific metrics around heart-rate zones (LT1/LT2 thresholds).

---

## What's Built

### Dashboard

**KPI Cards**
- Weekly Zone 2 volume with progress bar against target
- HRV status (green/yellow/red vs. baseline)
- ACWR training load ratio with risk flag

**Daily Readiness Banner**
- Combines HRV CV₇d with sleep chronic/acute signals
- Green → Full double-threshold execution
- Yellow → Acute sleep deficit → proceed with LT1, monitor HR lag
- Red → High autonomic volatility + chronic sleep debt → cap LT2 volume
- Thresholds: CV > 10%, Sleep₇d < 7.0 h, Sleep₁d < 85% of 7-day mean

**Analytics Charts**
- Weekly Intensity Distribution (Z1/Z2/Z3 stacked bars, last 8 weeks)
- Autonomic Recovery vs Stress (HRV + training load dual-axis, last 30 days)
- 7-Day Rolling HRV Metrics: μ₇d and ±1σ band (left axis) + CV₇d% (right axis); stat badges for current values
- Sleep Duration Box: Sleep₁d and Sleep₇d mean in hours; deep% and REM% for last night
- Distance Drill-down: monthly → weekly → daily km; double-click to drill down, breadcrumb to go back

**Activity Table**
- Last 10 runs, clickable for detail modal
- Detail modal: HR drift, pace, power time-series; zone breakdown; biomechanics

### Backend API (`/api/...`)

| Endpoint | Description |
|---|---|
| `POST /api/auth/login` | Local credential gate |
| `GET /api/dashboard/summary` | KPI aggregates for current week |
| `GET /api/dashboard/intensity-distribution` | Weekly zone breakdown |
| `GET /api/dashboard/hrv-load` | HRV + training load time series |
| `GET /api/dashboard/hrv-rolling` | 7-day rolling μ, σ, CV of lnHRV |
| `GET /api/dashboard/sleep-stats` | Acute + chronic sleep duration stats |
| `GET /api/dashboard/readiness` | Daily readiness flag (green/yellow/red) |
| `GET /api/activities/daily-distance` | Per-day km totals (last 13 months) |
| `GET /api/activities/` | Paginated activity list |
| `GET /api/activities/{id}` | Activity detail + JSONB time-series |
| `PATCH /api/activities/{id}` | Update lactate measurements inline |
| `POST /api/import/fit/trigger` | Bulk import from local directory path |
| `POST /api/import/fit/upload` | Upload .fit files from browser (small batches) |
| `GET /api/import/fit/status` | Import job progress |
| `POST /api/sync/trigger` | Trigger Coros API sync |
| `GET /api/sync/status` | Sync job status |
| `GET /api/athlete` | Read athlete profile |
| `PUT /api/athlete` | Upsert athlete profile |

### Pages
- `/login` — dark zinc auth card
- `/dashboard` — main analytics dashboard
- `/advanced-metrics` — paginated activity table with inline lactate entry
- `/athlete-settings` — athlete profile (max HR, LT1/LT2, paces, targets)

---

## Setup & Running

This project uses `uv` for Python dependency management.

```bash
uv sync          # install dependencies
uv add <pkg>     # add a dependency
```

Python version: 3.11 (pinned in `.python-version`).

### Start the database

```bash
docker compose up -d
```

### Start the backend (FastAPI)

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Start the frontend (Next.js)

```bash
cd frontend
npm run dev      # http://localhost:3000
```

The frontend proxies all `/api/*` requests to `localhost:8000` via Next.js rewrites (except `/api/import/fit/upload` which uses a Route Handler to stream large files directly).

---

## Architecture

```
[COROS Cloud] ──(Daily Cron / Manual Upload / MCP Server)──> [FastAPI Backend] ──> [Calculations Engine]
                                                                      │                      │
                                                                      ▼                      ▼
[Next.js Frontend] <──(JSON REST API)──────────────────────── [PostgreSQL] <──── [Normalized Tables]
```

- **Backend**: FastAPI (Python), APScheduler cron (daily sync at 09:00 Europe/Rome)
- **Database**: PostgreSQL in Docker; schema managed manually (no Alembic)
- **Frontend**: Next.js 16 (App Router) + Tailwind v4 + Recharts v3
- **Data source**: COROS wearable — via MCP stdio client or manual `.fit` upload

### Norwegian Method Training Zones

| Zone | Range | Description |
|---|---|---|
| Zone 1 | < LT1 | Easy aerobic base |
| Zone 2 | LT1 – LT2 | Threshold sweet spot |
| Zone 3 | > LT2 | VO2max / high intensity |

LT1 ≈ LT2 × 0.88 (configurable via Athlete Profile).

---

## Database Schema (summary)

| Table | Key columns |
|---|---|
| `daily_metrics` | date, resting_hr, hrv_today, hrv_baseline, training_load, training_load_ratio, vo2max, lactate_threshold_hr |
| `sleep_records` | date, total_duration_mins, deep_mins, rem_mins, quality_score (always NULL — not exposed by Coros MCP) |
| `activity_summaries` | activity_id, date, distance_meters, avg_hr, zone1/2/3_secs, avg_cadence, ground_time, stride_height, lactate_1-5_mmol/notes |
| `activity_time_series` | activity_id, stream_data (JSONB: timestamps, heart_rate, power, speed, lat_long, …) |
| `athlete_profile` | id=1 (singleton), max_hr, lt1_hr, lt2_hr, lt1_lthr_ratio, ftp_watts, weekly_zone2_target_mins, … |

Schema changes require a manual `ALTER TABLE` on the Docker container:
```bash
docker exec coros_postgres psql -U groggero -d data_and_miles -c "ALTER TABLE ..."
```

---

## Bulk .fit Import

For historical imports (hundreds of files), use the directory trigger — do **not** use the browser upload button:

```bash
curl -X POST "http://localhost:8000/api/import/fit/trigger?fit_dir=/path/to/fit/files"
# Poll status:
curl http://localhost:8000/api/import/fit/status
```

---

## Backlog

### Must have
1. Admin menu to modify data like ranges, threshold, max HR — ✅ Athlete Profile settings page
2. Define roles: Admin / Athlete / Coach
3. Data points:
   - ✅ Lactate measurement columns (5× mmol + notes per activity)
   - ✅ Athlete profile table (thresholds, HR max, anthropometrics, training targets)
   - ✅ Removed `is_double_threshold` column and all related logic
4. Frontend:
   - ✅ Inline lactate entry in Advanced Metrics table
   - ✅ Manual `.fit` file upload button on dashboard
   - Metric tooltips on hover
5. Production deployment on Oracle VM at dataandmiles.com

### Nice to have
1. Multi-user support (new users trigger full DB population workflow)
2. Per-user column in `activity_summaries` for multi-user separation
3. Per-run HR% of max trend chart
4. Weekly threshold volume trend chart
5. Personalised readiness thresholds (calibrated over time per athlete)
