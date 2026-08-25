import math
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select, text

from models import ActivitySummary, AthleteProfile, DailyMetrics, SleepRecord, AsyncSessionLocal

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _hrv_status(hrv_today: float | None, hrv_baseline: float | None) -> str:
    if hrv_today is None or hrv_baseline is None:
        return "unknown"
    diff = hrv_today - hrv_baseline
    if diff >= -2:
        return "green"
    if diff >= -7:
        return "yellow"
    return "red"


@router.get("/summary")
async def get_summary() -> dict[str, Any]:
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday

    async with AsyncSessionLocal() as session:
        profile = await session.get(AthleteProfile, 1)
        zone2_target_mins = (profile.weekly_zone2_target_mins if profile and profile.weekly_zone2_target_mins else 90)

        # Today's daily metrics (most recent if today is missing)
        today_row = (
            await session.execute(
                select(DailyMetrics)
                .where(DailyMetrics.date <= today)
                .order_by(DailyMetrics.date.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        # This week's total zone2 seconds
        z2_result = await session.execute(
            select(func.coalesce(func.sum(ActivitySummary.zone2_secs), 0)).where(
                ActivitySummary.date >= week_start
            )
        )
        weekly_z2_secs: int = z2_result.scalar_one()

    hrv_today = today_row.hrv_today if today_row else None
    hrv_baseline = today_row.hrv_baseline if today_row else None
    acwr = today_row.training_load_ratio if today_row else None

    return {
        "weekly_threshold_volume_secs": weekly_z2_secs,
        "weekly_threshold_target_secs": zone2_target_mins * 60,
        "hrv_today": hrv_today,
        "hrv_baseline": hrv_baseline,
        "hrv_status": _hrv_status(hrv_today, hrv_baseline),
        "acwr": acwr,
        "metrics_date": today_row.date.isoformat() if today_row else None,
    }


@router.get("/intensity-distribution")
async def get_intensity_distribution(
    weeks: int = Query(default=8, ge=1, le=52),
) -> list[dict[str, Any]]:
    cutoff = date.today() - timedelta(weeks=weeks)

    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                text("""
                    SELECT
                        date_trunc('week', date)::date          AS week_start,
                        COALESCE(SUM(zone1_secs), 0) / 60.0    AS zone1_mins,
                        COALESCE(SUM(zone2_secs), 0) / 60.0    AS zone2_mins,
                        COALESCE(SUM(zone3_secs), 0) / 60.0    AS zone3_mins
                    FROM activity_summaries
                    WHERE date >= :cutoff
                    GROUP BY week_start
                    ORDER BY week_start
                """),
                {"cutoff": cutoff},
            )
        ).fetchall()

    return [
        {
            "week_start": row[0].isoformat(),
            "zone1_mins": round(float(row[1]), 1),
            "zone2_mins": round(float(row[2]), 1),
            "zone3_mins": round(float(row[3]), 1),
        }
        for row in rows
    ]


@router.get("/zone2-trend")
async def get_zone2_trend(
    weeks: int = Query(default=12, ge=4, le=52),
) -> list[dict[str, Any]]:
    """Weekly Zone 2 minutes for the last `weeks` weeks, with gaps filled as 0.
    Includes target_mins from athlete profile and is_current flag for the live week."""
    today = date.today()
    current_week_start = today - timedelta(days=today.weekday())

    async with AsyncSessionLocal() as session:
        profile = await session.get(AthleteProfile, 1)
        target_mins = int(profile.weekly_zone2_target_mins) if profile and profile.weekly_zone2_target_mins else 0

        rows = (
            await session.execute(
                text("""
                    SELECT
                        gs.week_start::date             AS week_start,
                        COALESCE(SUM(a.zone2_secs), 0) / 60.0 AS zone2_mins
                    FROM generate_series(
                        date_trunc('week', CURRENT_DATE - (:weeks - 1) * interval '1 week'),
                        date_trunc('week', CURRENT_DATE),
                        interval '1 week'
                    ) AS gs(week_start)
                    LEFT JOIN activity_summaries a
                        ON date_trunc('week', a.date)::date = gs.week_start
                    GROUP BY gs.week_start
                    ORDER BY gs.week_start
                """),
                {"weeks": weeks},
            )
        ).fetchall()

    return [
        {
            "week_start": row[0].isoformat(),
            "zone2_mins": round(float(row[1]), 1),
            "target_mins": target_mins,
            "is_current": row[0] == current_week_start,
        }
        for row in rows
    ]


@router.get("/hrv-load")
async def get_hrv_load(
    days: int = Query(default=30, ge=7, le=90),
) -> list[dict[str, Any]]:
    cutoff = date.today() - timedelta(days=days)

    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(
                    DailyMetrics.date,
                    DailyMetrics.hrv_today,
                    DailyMetrics.hrv_baseline,
                    DailyMetrics.training_load,
                )
                .where(DailyMetrics.date >= cutoff)
                .order_by(DailyMetrics.date)
            )
        ).fetchall()

    return [
        {
            "date": row[0].isoformat(),
            "hrv_today": row[1],
            "hrv_baseline": row[2],
            "training_load": row[3],
        }
        for row in rows
    ]


@router.get("/hrv-rolling")
async def get_hrv_rolling(
    days: int = Query(default=120, ge=14, le=365),
) -> list[dict[str, Any]]:
    """7-day rolling lnHRV mean (μ), sample SD (σ), and CV% for the last `days` days.

    Uses the last 7 available data points (not strict calendar days) so gaps
    from rest days or missing syncs don't break the series. Fetches all HRV
    history so the rolling window is always seeded correctly even after long gaps.
    """
    window_start = date.today() - timedelta(days=days)

    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(DailyMetrics.date, DailyMetrics.hrv_today)
                .where(DailyMetrics.hrv_today.isnot(None))
                .where(DailyMetrics.hrv_today > 0)
                .order_by(DailyMetrics.date)
            )
        ).fetchall()

    if len(rows) < 7:
        return []

    result = []
    for i in range(6, len(rows)):
        row_date = rows[i][0]
        if row_date < window_start:
            continue

        window = [rows[j][1] for j in range(i - 6, i + 1)]
        ln_vals = [math.log(v) for v in window]
        mu = sum(ln_vals) / 7
        sigma = math.sqrt(sum((v - mu) ** 2 for v in ln_vals) / 6)  # sample SD (n-1)
        cv = (sigma / mu) * 100 if mu != 0 else 0.0

        result.append({
            "date": row_date.isoformat(),
            "mu_7d": round(mu, 4),
            "sigma_7d": round(sigma, 4),
            "cv_7d": round(cv, 4),
        })

    return result


@router.get("/sleep-stats")
async def get_sleep_stats() -> dict[str, Any]:
    """Acute sleep (last night) and chronic baseline (7-day rolling mean).

    Uses total_duration_mins — quality_score is not provided by the Coros MCP server.
    Returns durations in hours (rounded to 1 decimal place).
    """
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(SleepRecord.date, SleepRecord.total_duration_mins,
                       SleepRecord.deep_mins, SleepRecord.rem_mins)
                .where(SleepRecord.total_duration_mins.isnot(None))
                .where(SleepRecord.total_duration_mins > 0)
                .order_by(SleepRecord.date.desc())
                .limit(7)
            )
        ).fetchall()

    if not rows:
        return {"sleep_1d_hrs": None, "sleep_7d_mean_hrs": None,
                "deep_pct": None, "rem_pct": None, "date_1d": None}

    # Most recent night (Sleep_1d)
    latest = rows[0]
    sleep_1d_hrs = round(latest[1] / 60, 1)
    deep_pct = round(latest[2] / latest[1] * 100) if latest[2] else None
    rem_pct  = round(latest[3] / latest[1] * 100) if latest[3] else None

    # 7-day rolling mean (Sleep_7d) — up to 7 most recent nights
    mean_mins = sum(r[1] for r in rows) / len(rows)
    sleep_7d_mean_hrs = round(mean_mins / 60, 1)

    return {
        "sleep_1d_hrs": sleep_1d_hrs,
        "sleep_7d_mean_hrs": sleep_7d_mean_hrs,
        "deep_pct": deep_pct,
        "rem_pct": rem_pct,
        "date_1d": latest[0].isoformat(),
    }


# ── Thresholds ────────────────────────────────────────────────────────────────
_CV_VOLATILITY_PCT   = 10.0   # CV₇d above this → high autonomic volatility
_SLEEP_BASELINE_HRS  = 7.0    # chronic baseline (replaces 75/100 quality score)
_ACUTE_DEFICIT_RATIO = 0.85   # last night < 85% of 7d mean → acute deficit


@router.get("/readiness")
async def get_readiness() -> dict[str, Any]:
    """Training readiness flag combining HRV CV₇d with sleep chronic/acute signals."""

    # ── Latest HRV CV₇d (reuse rolling logic, only need the most recent point) ──
    async with AsyncSessionLocal() as session:
        hrv_rows = (
            await session.execute(
                select(DailyMetrics.date, DailyMetrics.hrv_today)
                .where(DailyMetrics.hrv_today.isnot(None))
                .where(DailyMetrics.hrv_today > 0)
                .order_by(DailyMetrics.date.desc())
                .limit(7)
            )
        ).fetchall()

    cv_7d: float | None = None
    if len(hrv_rows) == 7:
        ln_vals = [math.log(r[1]) for r in hrv_rows]
        mu = sum(ln_vals) / 7
        sigma = math.sqrt(sum((v - mu) ** 2 for v in ln_vals) / 6)
        cv_7d = round((sigma / mu) * 100, 2) if mu != 0 else None

    # ── Sleep stats (reuse the same query as /sleep-stats) ───────────────────
    async with AsyncSessionLocal() as session:
        sleep_rows = (
            await session.execute(
                select(SleepRecord.date, SleepRecord.total_duration_mins)
                .where(SleepRecord.total_duration_mins.isnot(None))
                .where(SleepRecord.total_duration_mins > 0)
                .order_by(SleepRecord.date.desc())
                .limit(7)
            )
        ).fetchall()

    sleep_1d_hrs: float | None = None
    sleep_7d_mean_hrs: float | None = None
    if sleep_rows:
        sleep_1d_hrs = round(sleep_rows[0][1] / 60, 1)
        sleep_7d_mean_hrs = round(sum(r[1] for r in sleep_rows) / len(sleep_rows) / 60, 1)

    # ── Readiness flags ───────────────────────────────────────────────────────
    high_cv        = cv_7d is not None and cv_7d > _CV_VOLATILITY_PCT
    chronic_debt   = sleep_7d_mean_hrs is not None and sleep_7d_mean_hrs < _SLEEP_BASELINE_HRS
    acute_deficit  = (
        sleep_1d_hrs is not None
        and sleep_7d_mean_hrs is not None
        and sleep_1d_hrs < sleep_7d_mean_hrs * _ACUTE_DEFICIT_RATIO
    )

    if high_cv and chronic_debt:
        status = "red"
        label  = "High Autonomic Volatility + Chronic Sleep Debt"
        action = "Cap LT2 volume — prioritise recovery"
    elif acute_sleep_deficit := acute_deficit:
        status = "yellow"
        label  = "Acute Sleep Deficit"
        action = "Proceed with LT1 — monitor HR lag"
    else:
        status = "green"
        label  = "Fully Recovered"
        action = "Full double-threshold execution"

    return {
        "status": status,
        "label": label,
        "action": action,
        "cv_7d": cv_7d,
        "sleep_1d_hrs": sleep_1d_hrs,
        "sleep_7d_mean_hrs": sleep_7d_mean_hrs,
        "high_autonomic_volatility": high_cv,
        "chronic_sleep_debt": chronic_debt,
        "acute_sleep_deficit": acute_deficit,
    }
