# Session Log

## Session 3 — 2026-06-06

### What was built

**Backend (FastAPI)**
- `models.py` — Added `AthleteProfile` singleton table (`CHECK (id = 1)`): max_hr, resting_hr, lt1_hr, lt2_hr, lt1_lthr_ratio, lt1/lt2 pace (sec/km), ftp_watts, weekly_zone2_target_mins, date_of_birth, gender, height_cm, weight_kg, updated_at
- `models.py` — Added 10 lactate columns to `activity_summaries`: `lactate_1_mmol` … `lactate_5_mmol` (float) and `lactate_1_notes` … `lactate_5_notes` (text)
- `models.py` — Removed `is_double_threshold` column from `activity_summaries`
- `app/services/athlete.py` — New: `load_profile()`, `effective_max_hr()`, `effective_lt1_ratio()`, `effective_lt2_hr()`, `effective_lt1_hr()` — profile always takes priority over `.env` hardcoded values
- `app/routers/athlete.py` — New: `GET /api/athlete`, `PUT /api/athlete` (upsert with `ON CONFLICT DO UPDATE`)
- `app/routers/activities.py` — Added `PATCH /api/activities/{id}` for inline lactate entry; added `GET /api/activities/count`; `list_activities` now accepts `offset` param (up to 500 limit)
- `app/routers/fit_import.py` — Added `POST /api/import/fit/upload` multipart endpoint (saves to tempdir, runs background import, cleans up)
- `app/routers/dashboard.py` — Removed `double_threshold_days` query; weekly_zone2_target now loaded from `athlete_profile`
- `app/services/ingestion.py` — Removed `_refresh_double_threshold()` and all call sites; max_hr upsert now conditional (preserves backfilled values on re-sync)
- `app/services/fit_importer.py` — Now loads `athlete_profile` for `effective_max_hr` and `effective_lt1_ratio`; removed `_refresh_double_threshold` call
- `app/services/coros_client.py` — Added `max_hr` parsing from activity detail response

**Frontend (Next.js 16 + Tailwind v4)**
- `components/NavDrawer.tsx` — Hamburger slide-in drawer with 3 nav items: Dashboard, Advanced Metrics, Athlete Profile; active link highlighted via `usePathname()`
- `components/UploadFitButton.tsx` — File picker for `.fit` files, POSTs multipart to `/api/import/fit/upload`, polls status every 2s, shows toast on completion
- `app/advanced-metrics/page.tsx` — Paginated table (50/page) of all activities with inline lactate data entry per row; per-row save state (idle/saving/saved/error)
- `app/athlete-settings/page.tsx` — Settings page with 5 grouped section cards (Personal, Cardiac, Lactate Thresholds, Power, Training Targets); PaceInput split M:SS control; GenderPicker segmented button; derived LT1 hint
- `app/layout.tsx` — Added `suppressHydrationWarning` to `<html>` and `<body>` (fixes browser-extension attribute injection)
- `components/KpiCards.tsx` — Removed `DoubleThresholdCard`
- `components/ActivityTable.tsx` — Removed Double Day column; `colSpan` fixed 7→6
- `components/ActivityDetailModal.tsx` — Removed Double Threshold badge
- `app/dashboard/page.tsx` — Added NavDrawer + UploadFitButton; KPI grid 4→3 columns
- `lib/api.ts` — Added: `LactateFields`, `AthleteProfile`, `FitImportStatus` interfaces; `uploadFitFiles()`, `getFitImportStatus()`, `getAthleteProfile()`, `updateAthleteProfile()`, `updateActivityLactate()`, `getActivitiesCount()`, `listActivities` with offset

**Database migration applied**
```sql
ALTER TABLE activity_summaries DROP COLUMN IF EXISTS is_double_threshold;
```

### Current database state
- Same 1,014 activities as Session 2
- `athlete_profile` table created but empty — fill in via Athlete Profile settings page before next sync/import to get correct zone calculations
- `is_double_threshold` column dropped from `activity_summaries`
- Lactate columns added (all null until manually entered)

### Key decisions
- `athlete_profile` is a singleton row (id=1, enforced by CHECK constraint). The calculation engine always prefers profile values over `.env` fallbacks.
- `max_hr` on sync: if the incoming value is null (Coros API often omits it), the existing DB value is preserved — prevents overwriting manually backfilled or `.fit`-derived values.
- Historical zone data (pre-May 2026) remains zero. Re-importing `.fit` files after setting `lt2_hr` in Athlete Profile will retroactively compute zones.

### Known issues / decisions deferred
- Zone data is 0 for pre-May-2026 activities — fix: set `lt2_hr` in Athlete Profile page, then re-upload `.fit` files
- No sport column in `activity_summaries` — all displayed as "Run"; fine for now
- DB schema is managed manually (no Alembic). Each column addition/removal requires a manual `ALTER TABLE` on the Docker container

### Git
- Commit: `f2242c0` — all session changes in one bundle on `master`

### Possible next session topics
- Fill in Athlete Profile (lt2_hr, max_hr, weekly target) to enable correct zone calculations
- Re-upload `.fit` files to back-populate historical zones
- Deployment to dataandmiles.com (Docker + nginx + Vercel/VPS)
- Add sport/activity_name column to activity_summaries
- Per-run HR% of max chart on dashboard
- Weekly threshold volume trend chart

---

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
