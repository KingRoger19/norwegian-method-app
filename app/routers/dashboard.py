from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, select, text

from models import ActivitySummary, DailyMetrics, AsyncSessionLocal

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

        # Double-threshold days in current week
        dt_result = await session.execute(
            select(func.count(func.distinct(ActivitySummary.date))).where(
                ActivitySummary.date >= week_start,
                ActivitySummary.is_double_threshold == True,  # noqa: E712
            )
        )
        double_threshold_days: int = dt_result.scalar_one()

    hrv_today = today_row.hrv_today if today_row else None
    hrv_baseline = today_row.hrv_baseline if today_row else None
    acwr = today_row.training_load_ratio if today_row else None

    return {
        "weekly_threshold_volume_secs": weekly_z2_secs,
        "weekly_threshold_target_secs": 5400,  # 90 minutes
        "double_threshold_days": double_threshold_days,
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
