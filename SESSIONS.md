# Session Log

## Session 2 — 2026-06-05/06

### What was built

**Backend (FastAPI)**
- `models.py` — SQLAlchemy async ORM for all 4 tables: `daily_metrics`, `sleep_records`, `activity_summaries`, `activity_time_series`
- `app/config.py` — Pydantic settings loaded from `.env`
- `app/services/coros_client.py` — MCP stdio client wrapping `coros-mcp serve`; handles date format quirks
- `app/services/ingestion.py` — `run_sync(weeks)`: pulls daily metrics, sleep, and activity detail from Coros API; upserts all tables; refreshes double-threshold flag
- `app/services/fit_importer.py` — batch imports 1,014 historical `.fit` files using `garmin-fit-sdk`; computes per-second zones from HR stream; upserts summaries + JSONB time-series
- `app/routers/sync.py` — `POST /api/sync/trigger`, `GET /api/sync/status`
- `app/routers/fit_import.py` — `POST /api/import/fit/trigger`, `GET /api/import/fit/status`
- `app/routers/auth.py` — `POST /api/auth/login` (local credential gate)
- `app/routers/dashboard.py` — `GET /api/dashboard/summary|intensity-distribution|hrv-load`
- `app/routers/activities.py` — `GET /api/activities/`, `GET /api/activities/{id}`
- `app/scheduler.py` — APScheduler cron job: daily sync at 09:00 Europe/Rome
- `app/main.py` — FastAPI app with lifespan, CORS for localhost:3000, all routers mounted

**Frontend (Next.js 16 + Tailwind v4 + Recharts v3)**
- `/login` — dark zinc card, credentials pre-filled from `frontend/.env.local`, Remember Me via localStorage
- `/dashboard`:
  - **4 KPI cards**: Weekly Z2 volume with progress bar, Double-Threshold flame badges, HRV green/yellow/red status dot, ACWR with risk flag
  - **Intensity Distribution chart**: stacked bar — Zone 1/2/3 minutes per week (last 8 weeks)
  - **HRV vs Load chart**: dual-axis — HRV today + dashed baseline vs training load bars (last 30 days)
  - **Activity table**: last 10 runs, clickable rows
  - **Activity detail modal**: per-second HR drift, pace, and power charts from JSONB stream
  - **Sync button**: triggers backend sync, polls status, shows success toast

### Current database state
- **1,014 activities** imported (2022-06-01 → 2026-06-05)
- **687 daily_metrics rows** with real HRV/load data for ~last 2 weeks; rest are stub rows
- **Zone data**: only populated for activities from ~May 22 onwards (when LTHR became available from Coros sync). Historical zones are all zero — intentionally left as-is; training block starts September 2026
- **`pct_of_hr_max`**: recalculated for all 996 activities using **max HR = 190**
- **LTHR**: 167–168 bpm (as reported by Coros)
- **LT1**: `LTHR × 0.88` ≈ 148 bpm

### Known issues / decisions deferred
- Zone data is 0 for pre-May-2026 activities (no LTHR available for historical dates). Agreed to leave as-is — real training block starts September 2026, data will be correct from then on.
- No sport column in `activity_summaries` — all activities displayed as "Run" in the frontend. Fine for now since user only tracks running.

### Environment
| Service | Command | URL |
|---------|---------|-----|
| PostgreSQL | `docker compose up -d` | `localhost:5432` db=`data_and_miles` |
| Backend | `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000` | `localhost:8000` |
| Frontend | `cd frontend && npm run dev` | `localhost:3000` |

### Possible next session topics
- Add more backend API endpoints as new dashboard views are needed (e.g. per-run HR% of max chart, weekly threshold volume trend)
- Deployment to dataandmiles.com (Docker + nginx + Vercel/VPS)
- Add sport/activity_name column to activity_summaries
- Configure Coros auto-sync and verify it runs at 09:00
