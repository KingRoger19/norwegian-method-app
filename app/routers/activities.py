from typing import Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from models import ActivitySummary, ActivityTimeSeries, AsyncSessionLocal

router = APIRouter(prefix="/api/activities", tags=["activities"])


def _fmt_duration(secs: int) -> str:
    h, rem = divmod(secs, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _z2_pct(z1: int, z2: int, z3: int, duration: int) -> float | None:
    total = z1 + z2 + z3
    if total > 0:
        return round(z2 / total * 100, 1)
    if duration > 0:
        return round(z2 / duration * 100, 1)
    return None


def _summary_to_dict(a: ActivitySummary) -> dict[str, Any]:
    return {
        "activity_id": a.activity_id,
        "date": a.date.isoformat(),
        "start_time": a.start_time.isoformat(),
        "duration_seconds": a.duration_seconds,
        "duration_formatted": _fmt_duration(a.duration_seconds),
        "distance_km": round(a.distance_meters / 1000, 2) if a.distance_meters else 0,
        "avg_hr": a.avg_hr,
        "max_hr": a.max_hr,
        "avg_cadence": a.avg_cadence,
        "avg_stride_length": a.avg_stride_length,
        "ground_time": a.ground_time,
        "stride_height": a.stride_height,
        "zone1_secs": a.zone1_secs,
        "zone2_secs": a.zone2_secs,
        "zone3_secs": a.zone3_secs,
        "zone2_pct": _z2_pct(a.zone1_secs, a.zone2_secs, a.zone3_secs, a.duration_seconds),
        "is_double_threshold": a.is_double_threshold,
        "total_ascent": a.total_ascent,
        "avg_power": a.avg_power,
    }


@router.get("/")
async def list_activities(
    limit: int = Query(default=10, ge=1, le=100),
) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(ActivitySummary)
                .order_by(ActivitySummary.date.desc(), ActivitySummary.start_time.desc())
                .limit(limit)
            )
        ).scalars().all()

    return [_summary_to_dict(a) for a in rows]


@router.get("/{activity_id}")
async def get_activity(activity_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as session:
        summary = await session.get(ActivitySummary, activity_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Activity not found")

        ts_row = (
            await session.execute(
                select(ActivityTimeSeries).where(
                    ActivityTimeSeries.activity_id == activity_id
                )
            )
        ).scalar_one_or_none()

    result = _summary_to_dict(summary)
    result["stream_data"] = ts_row.stream_data if ts_row else None
    return result
