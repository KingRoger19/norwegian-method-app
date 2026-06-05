## Project Overview

A fitness analytics app for Norwegian Method endurance training, planned to be deployed at **dataandmiles.com**. It ingests workout data from COROS devices and computes training-specific metrics around heart-rate zones (LT1/LT2 thresholds).

The project is in early scaffolding stage — the architecture is designed (`Ark_v1.0.drawio`) but most implementation is yet to be built.

## Setup

This project uses `uv` for Python dependency management.

```bash
uv sync          # install dependencies
uv run main.py   # run the app
uv add <pkg>     # add a dependency
```

Python version: 3.10 (pinned in `.python-version`).

## Planned Architecture

```
[COROS Cloud] ──(Daily Cron / Manual Upload / MCP Server)──> [FastAPI Backend] ──> [Calculations Engine]
                                                                      │                      │
                                                                      ▼                      ▼
[Next.js Frontend] <──(JSON REST API)──────────────────────── [PostgreSQL] <──── [Normalized Tables]
```

- **Backend**: FastAPI (Python), task scheduling via APScheduler or Celery
- **Database**: PostgreSQL with normalized tables for workout/metric data
- **Frontend**: Next.js (React + TypeScript)
- **Data source**: COROS wearable DB — ingested via manual upload or MCP Server connector

## Domain: Norwegian Method Training Zones

The core concept is 3-zone intensity distribution based on lactate thresholds:
- **Zone 1**: Below LT1 (aerobic threshold) — easy aerobic base
- **Zone 2**: Between LT1 and LT2 (anaerobic threshold) — the Norwegian "threshold" sweet spot
- **Zone 3**: Above LT2 — high intensity

## Database Schema: Norwegian Method Training Engine

This application utilizes a normalized PostgreSQL database to separate daily high-level health/recovery summaries from high-resolution, second-by-second activity data streams. 

All tables are optimized for calculating running dynamics and intensity distribution metrics specific to the Norwegian Method (Zone 1 / Zone 2 Threshold / Zone 3 VO2Max tracking).

---

### 1. Table: `daily_metrics`
Tracks daily autonomic recovery baselines and total stress accumulation. One row per calendar day.

| Column Name | Type | Constraints | Description / Norwegian Method Context |
| :--- | :--- | :--- | :--- |
| `date` | DATE | PRIMARY KEY | Calendar date of record. |
| `resting_heart_rate` | INTEGER | Nullable | Waking resting HR; primary baseline recovery marker. |
| `hrv_baseline` | FLOAT | Nullable | Multi-week rolling HRV baseline. |
| `hrv_today` | FLOAT | Nullable | Specific waking HRV score for this date. |
| `training_load` | INTEGER | Nullable | Absolute daily training load index calculated by Coros. |
| `training_load_ratio` | FLOAT | Nullable | Acute-to-Chronic Workload Ratio (ACWR). |
| `tired_rate` | FLOAT | Nullable | Internal fatigue index. |
| `vo2max` | INTEGER | Nullable | Modeled maximal oxygen uptake trend. |
| `lactate_threshold_hr`| INTEGER | Nullable | Auto-detected second lactate threshold (LT2) in bpm. |

---

### 2. Table: `sleep_records`
Maintains macro sleep phase quality data. Linked 1:1 with the main daily metrics framework.

| Column Name | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `date` | DATE | PRIMARY KEY, FK -> `daily_metrics.date` | Maps straight to corresponding morning metric. |
| `total_duration_mins` | INTEGER | Not Null | Total minutes elapsed asleep. |
| `deep_mins` | INTEGER | Nullable | Deep sleep duration for physical recovery tracking. |
| `rem_mins` | INTEGER | Nullable | REM sleep duration for mental recovery tracking. |
| `quality_score` | INTEGER | Nullable | Coros sleep quality index score (1-100). |

---

### 3. Table: `activity_summaries`
Stores granular metrics for every completed running session, featuring advanced biomechanical variables and calculated threshold durations.

| Column Name | Type | Constraints | Description / Calculation Rule |
| :--- | :--- | :--- | :--- |
| `activity_id` | VARCHAR(50) | PRIMARY KEY | Unique activity string provided by Coros. |
| `date` | DATE | INDEX, FK -> `daily_metrics.date` | Links to the calendar tracking date. |
| `start_time` | TIMESTAMPTZ | Not Null | Precise recording kickoff in UTC. |
| `duration_seconds` | INTEGER | Not Null | Total active elapsed time. |
| `distance_meters` | FLOAT | Not Null | Total distance accumulated. |
| `avg_hr` | INTEGER | Nullable | Mean workout heart rate. |
| `max_hr` | INTEGER | Nullable | Peak workout heart rate. |
| `pct_of_hr_max` | FLOAT | Nullable | Computed via `(avg_hr / user_max_hr) * 100`. |
| `avg_power` | INTEGER | Nullable | Average absolute power in watts. |
| `normalized_power` | INTEGER | Nullable | Mathematically adjusted power for interval pacing. |
| `avg_cadence` | FLOAT | Nullable | Steps per minute (Calculated from rpm: `rpm * 2`). |
| `avg_stride_length` | FLOAT | Nullable | Extracted from `step_length` metrics. |
| `ground_time` | FLOAT | Nullable | Contact duration derived from `stance_time`. |
| `stride_height` | FLOAT | Nullable | Vertical displacement from `vertical_oscillation`. |
| `stride_ratio` | FLOAT | Nullable | Vertical dynamic ratio percentage (`vertical_ratio`). |
| `total_ascent` | FLOAT | Nullable | Total structural elevation gained. |
| `total_descent` | FLOAT | Nullable | Total structural elevation lost. |
| `vertical_speed` | FLOAT | Nullable | Rate of absolute altitude change per minute. |
| `zone1_secs` | INTEGER | Default 0 | **Calculated:** Total workout seconds spent under LT1. |
| `zone2_secs` | INTEGER | Default 0 | **Calculated:** Total threshold sweet-spot seconds (LT1 to LT2). |
| `zone3_secs` | INTEGER | Default 0 | **Calculated:** Total intensity seconds screaming above LT2. |
| `is_double_threshold` | BOOLEAN | Default False | **Calculated:** Flagged True if date contains $\ge 2$ Zone 2 sessions. |

---

### 4. Table: `activity_time_series`
Houses dense time-series streams parsed from raw files. Leverages PostgreSQL JSONB arrays for high-performance retrieval without overwhelming relational tracking rows.

| Column Name | Type | Constraints | Description / Payload Format |
| :--- | :--- | :--- | :--- |
| `activity_id` | VARCHAR(50) | PRIMARY KEY, FK -> `activity_summaries.activity_id` | Connects single-file stream back to core metadata summary. |
| `stream_data` | JSONB | Not Null | Structured JSON array storage for second-by-second analytics. |

#### `stream_data` Object Blueprint:
```json
{
  "timestamps": [1149438956, 1149438957, 1149438958],
  "heart_rate": [129, 130, 132],
  "power": [317, 320, 315],
  "speed": [12.521, 12.550, 12.490],
  "effort_pace": [4.155, 4.150, 4.162],
  "lat_long": [[51.24101, 6.78426], [51.24103, 6.78429]]
}
```

### Key Metrics to Implement
- **Weekly Threshold Volume**: Total km or time strictly in Zone 2 (LT1–LT2)
- **Autonomic Recovery Score**: 7-day rolling waking HRV overlaid against total threshold volume to detect nervous system overload

### Key Graphs to Implement
- **Intensity Distribution Histogram**: 3-zone pyramidal vs. polarized chart (time in Zone 1 / Zone 2 / Zone 3)
- **Cardiovascular Drift Tracker**: Scatter plot of HR vs. pace over long steady workouts to assess aerobic base quality
- **Per-run HR% of Max**: Each run's average HR as a percentage of HR max
