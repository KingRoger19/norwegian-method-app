from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from models import ActivitySummary, ActivityTimeSeries, IntervalAnalysis, IntervalSet, AsyncSessionLocal

router = APIRouter(prefix="/api/activities", tags=["interval-analysis"])

INTERVAL_TAGS = {"Interval", "Fartlek", "Sprint hills", "Varied tempo run"}


# ── Computation ───────────────────────────────────────────────────────────────

def _build_hr_lookup(stream_data: dict) -> dict[int, int]:
    """Return {seconds_from_start: hr} from the raw stream."""
    timestamps = stream_data.get("timestamps") or []
    heart_rates = stream_data.get("heart_rate") or []
    if not timestamps:
        return {}
    t0 = timestamps[0]
    lookup: dict[int, int] = {}
    for ts, hr in zip(timestamps, heart_rates):
        if hr is not None:
            lookup[int(ts - t0)] = int(hr)
    return lookup


def _hr_at(lookup: dict[int, int], offset: int, max_offset: int, search_radius: int = 5) -> int | None:
    """Find HR at or nearest to `offset` seconds, within search_radius."""
    if offset < 0 or offset > max_offset + search_radius:
        return None
    if offset in lookup:
        return lookup[offset]
    for delta in range(1, search_radius + 1):
        if offset + delta in lookup:
            return lookup[offset + delta]
        if offset - delta in lookup and offset - delta >= 0:
            return lookup[offset - delta]
    return None


def compute_interval_sets(
    stream_data: dict,
    warmup_secs: int,
    reps: int,
    effort_secs: int,
    recovery_secs: int,
) -> list[dict[str, Any]]:
    lookup = _build_hr_lookup(stream_data)
    if not lookup:
        return []

    max_offset = max(lookup.keys())
    sets: list[dict[str, Any]] = []
    cursor = warmup_secs

    for rep in range(1, reps + 1):
        effort_start = cursor
        effort_end = cursor + effort_secs

        # Peak HR during effort window
        effort_hrs = [lookup[s] for s in range(effort_start, effort_end + 1) if s in lookup]
        peak_hr = max(effort_hrs) if effort_hrs else None

        hrr: dict[int, int | None] = {}
        for t in (30, 60, 90, 120):
            hr = _hr_at(lookup, effort_end + t, max_offset)
            hrr[t] = (peak_hr - hr) if (peak_hr is not None and hr is not None) else None

        sets.append({
            "set_number": rep,
            "peak_hr": peak_hr,
            "hrr30": hrr[30],
            "hrr60": hrr[60],
            "hrr90": hrr[90],
            "hrr120": hrr[120],
        })

        cursor = effort_end + recovery_secs

    return sets


# ── Request / Response ────────────────────────────────────────────────────────

class IntervalAnalysisRequest(BaseModel):
    description: str | None = None
    warmup_secs: int = Field(default=0, ge=0)
    reps: int = Field(ge=1, le=50)
    effort_secs: int = Field(ge=5, le=3600)
    recovery_secs: int = Field(ge=5, le=3600)


def _analysis_to_dict(analysis: IntervalAnalysis) -> dict[str, Any]:
    return {
        "id": analysis.id,
        "activity_id": analysis.activity_id,
        "description": analysis.description,
        "warmup_secs": analysis.warmup_secs,
        "reps": analysis.reps,
        "effort_secs": analysis.effort_secs,
        "recovery_secs": analysis.recovery_secs,
        "created_at": analysis.created_at.isoformat(),
        "sets": [
            {
                "set_number": s.set_number,
                "peak_hr": s.peak_hr,
                "hrr30": s.hrr30,
                "hrr60": s.hrr60,
                "hrr90": s.hrr90,
                "hrr120": s.hrr120,
            }
            for s in analysis.sets
        ],
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{activity_id}/interval-analysis")
async def get_interval_analysis(activity_id: str) -> dict[str, Any] | None:
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                select(IntervalAnalysis)
                .where(IntervalAnalysis.activity_id == activity_id)
                .order_by(IntervalAnalysis.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if row is None:
            return None
        # Eagerly load sets within the same session
        await session.refresh(row, ["sets"])
        return _analysis_to_dict(row)


@router.post("/{activity_id}/interval-analysis")
async def create_interval_analysis(
    activity_id: str,
    body: IntervalAnalysisRequest,
) -> dict[str, Any]:
    async with AsyncSessionLocal() as session:
        # Verify activity exists
        activity = await session.get(ActivitySummary, activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        if activity.activity_tag not in INTERVAL_TAGS:
            raise HTTPException(
                status_code=422,
                detail=f"Interval analysis only available for: {sorted(INTERVAL_TAGS)}",
            )

        # Load time series
        ts_row = (
            await session.execute(
                select(ActivityTimeSeries).where(ActivityTimeSeries.activity_id == activity_id)
            )
        ).scalar_one_or_none()

        if ts_row is None:
            raise HTTPException(
                status_code=422,
                detail="No per-second data for this activity. Upload the .fit file first.",
            )

        # Run computation
        set_data = compute_interval_sets(
            stream_data=ts_row.stream_data,
            warmup_secs=body.warmup_secs,
            reps=body.reps,
            effort_secs=body.effort_secs,
            recovery_secs=body.recovery_secs,
        )

        async with session.begin():
            # Remove any existing analysis for this activity
            await session.execute(
                delete(IntervalAnalysis).where(IntervalAnalysis.activity_id == activity_id)
            )

            analysis = IntervalAnalysis(
                activity_id=activity_id,
                description=body.description,
                warmup_secs=body.warmup_secs,
                reps=body.reps,
                effort_secs=body.effort_secs,
                recovery_secs=body.recovery_secs,
            )
            session.add(analysis)
            await session.flush()  # get analysis.id

            for s in set_data:
                session.add(IntervalSet(
                    analysis_id=analysis.id,
                    set_number=s["set_number"],
                    peak_hr=s["peak_hr"],
                    hrr30=s["hrr30"],
                    hrr60=s["hrr60"],
                    hrr90=s["hrr90"],
                    hrr120=s["hrr120"],
                ))

        # Re-load with sets for response
        async with AsyncSessionLocal() as s2:
            fresh = (
                await s2.execute(
                    select(IntervalAnalysis)
                    .where(IntervalAnalysis.activity_id == activity_id)
                    .order_by(IntervalAnalysis.created_at.desc())
                    .limit(1)
                )
            ).scalar_one()
            await s2.refresh(fresh, ["sets"])
            return _analysis_to_dict(fresh)
