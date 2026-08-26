# Norwegian Method Training Analytics

A fitness analytics app for Norwegian Method endurance training, live at **[dataandmiles.com](https://dataandmiles.com)**. Ingests workout data from COROS devices and computes training-specific metrics around heart-rate zones (LT1/LT2 thresholds).

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
- Weekly Zone 2 Volume Trend: 12-week amber bar chart, dashed target reference line, faded bar for current in-progress week; ±delta vs target in tooltip
- Distance Drill-down: monthly → weekly → daily km; double-click to drill down, breadcrumb to go back

**Activity Table**
- Last 4 months of activities, paginated (10/page) with Previous/Next controls
- Detail modal: HR drift, pace, power time-series; zone breakdown; biomechanics; GPS route map (Leaflet, CartoDB dark tiles)

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
| `GET /api/dashboard/zone2-trend` | Weekly Z2 minutes for last N weeks (gaps filled) |
| `GET /api/activities/daily-distance` | Per-day km totals (last 13 months) |
| `GET /api/activities/` | Paginated activity list (optional `since` date filter) |
| `GET /api/activities/count` | Total activity count (optional `since` date filter) |
| `GET /api/activities/{id}` | Activity detail + JSONB time-series |
| `PATCH /api/activities/{id}` | Update lactate measurements inline |
| `POST /api/import/fit/trigger` | Bulk import from local directory path |
| `POST /api/import/fit/upload` | Upload .fit files from browser (small batches) |
| `GET /api/import/fit/status` | Import job progress |
| `POST /api/recalculate/trigger` | Recalculate zones & HR% from stored streams |
| `GET /api/recalculate/status` | Recalculation job status |
| `GET /api/wiki/comments` | List wiki comment threads (with nested replies) |
| `POST /api/wiki/comments` | Post a comment or reply (one level deep) |
| `DELETE /api/wiki/comments/{id}` | Delete a comment and its replies |
| `POST /api/sync/trigger` | Trigger Coros API sync |
| `GET /api/sync/status` | Sync job status |
| `GET /api/athlete` | Read athlete profile |
| `PUT /api/athlete` | Upsert athlete profile |

### Pages
- `/` — public blog home (light theme); five category cards; links to app
- `/blog/[category]` — post list per category
- `/blog/[category]/[slug]` — MDX post (gray-matter frontmatter, `next-mdx-remote/rsc`)
- `/login` — dark zinc auth card
- `/dashboard` — main analytics dashboard
- `/advanced-metrics` — paginated activity table with inline lactate entry
- `/athlete-settings` — athlete profile (max HR, LT1/LT2, paces, targets)
- `/wiki` — metric reference documentation (8 sections) + threaded comment board
- `/nutrition` — weekly meal plan table; upload a `.md` file to override, persisted in `localStorage`
- `/training-plan` — Week A/B training plan table; same `.md` upload pattern

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
| `wiki_comments` | id, parent_id (→ self, CASCADE), author, body, created_at |

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
2. Define roles: Admin / Athlete / Coach — ✅ Multi-user auth (owner + coach via `.env`)
3. Data points:
   - ✅ Lactate measurement columns (5× mmol + notes per activity)
   - ✅ Athlete profile table (thresholds, HR max, anthropometrics, training targets)
   - ✅ Removed `is_double_threshold` column and all related logic
   - ✅ Recalculate zones from stored HR streams without re-uploading .fit files
4. Frontend:
   - ✅ Inline lactate entry in Advanced Metrics table
   - ✅ Manual `.fit` file upload button on dashboard
   - ✅ GPS route map in activity detail modal (Leaflet, CartoDB dark tiles)
   - ✅ Paginated activity table on dashboard (last 4 months, 10/page)
   - ✅ Weekly Zone 2 volume trend chart (12 weeks, target line)
   - ✅ Metrics Wiki page with full indicator reference and threaded comment board
   - ✅ Nutrition page (weekly meal plan table, `.md` file upload to override)
   - ✅ Training Plan page (Week A/B table, same `.md` upload pattern)
   - Metric tooltips on hover
5. ✅ Production deployment — live at [dataandmiles.com](https://dataandmiles.com) on Oracle Cloud A1.Flex VM (nginx + Let's Encrypt + systemd services)

### Nice to have
1. ✅ Blog at `/` with MDX posts — 5 categories, `next-mdx-remote/rsc`, `@tailwindcss/typography`
2. Per-run HR% of max trend chart
3. Sport/activity type column in `activity_summaries`
4. Multi-user separation (per-user column in `activity_summaries`)
5. Personalised readiness thresholds (calibrated over time per athlete)
