from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select

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
        "total_ascent": a.total_ascent,
        "avg_power": a.avg_power,
        # lactate measurements (manually entered)
        "lactate_1_mmol": a.lactate_1_mmol,
        "lactate_1_notes": a.lactate_1_notes,
        "lactate_2_mmol": a.lactate_2_mmol,
        "lactate_2_notes": a.lactate_2_notes,
        "lactate_3_mmol": a.lactate_3_mmol,
        "lactate_3_notes": a.lactate_3_notes,
        "lactate_4_mmol": a.lactate_4_mmol,
        "lactate_4_notes": a.lactate_4_notes,
        "lactate_5_mmol": a.lactate_5_mmol,
        "lactate_5_notes": a.lactate_5_notes,
    }


class LactateUpdate(BaseModel):
    lactate_1_mmol: float | None = None
    lactate_1_notes: str | None = None
    lactate_2_mmol: float | None = None
    lactate_2_notes: str | None = None
    lactate_3_mmol: float | None = None
    lactate_3_notes: str | None = None
    lactate_4_mmol: float | None = None
    lactate_4_notes: str | None = None
    lactate_5_mmol: float | None = None
    lactate_5_notes: str | None = None


# /count and /daily-distance must be declared before /{activity_id}
@router.get("/daily-distance")
async def daily_distance(
    months: int = Query(default=13, ge=1, le=120),
) -> list[dict[str, Any]]:
    # Snap to first of month so we never return a partial month
    approx = date.today() - timedelta(days=months * 30)
    cutoff = approx.replace(day=1)
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(
                    ActivitySummary.date,
                    func.sum(ActivitySummary.distance_meters / 1000).label("km"),
                )
                .where(ActivitySummary.date >= cutoff)
                .group_by(ActivitySummary.date)
                .order_by(ActivitySummary.date)
            )
        ).all()
    return [{"date": str(r.date), "km": round(r.km, 2)} for r in rows]


@router.get("/count")
async def count_activities(
    since: date | None = Query(default=None),
) -> dict[str, int]:
    async with AsyncSessionLocal() as session:
        q = select(func.count()).select_from(ActivitySummary)
        if since:
            q = q.where(ActivitySummary.date >= since)
        total = (await session.execute(q)).scalar_one()
    return {"total": total}


@router.get("/")
async def list_activities(
    limit: int = Query(default=10, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    since: date | None = Query(default=None),
) -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as session:
        q = (
            select(ActivitySummary)
            .order_by(ActivitySummary.date.desc(), ActivitySummary.start_time.desc())
            .limit(limit)
            .offset(offset)
        )
        if since:
            q = q.where(ActivitySummary.date >= since)
        rows = (await session.execute(q)).scalars().all()
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


@router.patch("/{activity_id}")
async def update_activity_lactate(
    activity_id: str,
    body: LactateUpdate,
) -> dict[str, bool]:
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields provided")

    async with AsyncSessionLocal() as session:
        async with session.begin():
            activity = await session.get(ActivitySummary, activity_id)
            if not activity:
                raise HTTPException(status_code=404, detail="Activity not found")
            for field, value in updates.items():
                setattr(activity, field, value)

    return {"ok": True}
