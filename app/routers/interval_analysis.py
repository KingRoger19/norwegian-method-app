from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select

from models import ActivitySummary, ActivityTimeSeries, IntervalAnalysis, IntervalSet, AsyncSessionLocal

router = APIRouter(prefix="/api/activities", tags=["interval-analysis"])

INTERVAL_TAGS = {"Interval", "Fartlek", "Sprint hills", "Varied tempo run"}


# ── HR lookup ─────────────────────────────────────────────────────────────────

def _build_hr_lookup(stream_data: dict) -> dict[int, int]:
    """Return {seconds_from_start: hr}."""
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


# ── Distance lookup ───────────────────────────────────────────────────────────

def _build_distance_lookup(stream_data: dict) -> dict[int, float]:
    """Return {seconds_from_start: cumulative_distance_meters}. Speed is m/s."""
    timestamps = stream_data.get("timestamps") or []
    speeds = stream_data.get("speed") or []
    if not timestamps:
        return {}
    t0 = timestamps[0]
    cum = 0.0
    lookup: dict[int, float] = {}
    prev_ts = None
    for ts, spd in zip(timestamps, speeds):
        offset = int(ts - t0)
        dt = (ts - prev_ts) if prev_ts is not None else 1
        if spd is not None and spd > 0:
            cum += spd * dt
        lookup[offset] = cum
        prev_ts = ts
    return lookup


def _find_offset_at_distance(dist_lookup: dict[int, float], start_dist: float, target_dist: float) -> int | None:
    """Return the first second offset where cumulative distance >= start_dist + target_dist."""
    threshold = start_dist + target_dist
    for offset in sorted(dist_lookup.keys()):
        if dist_lookup[offset] >= threshold:
            return offset
    return None


# ── Computation ───────────────────────────────────────────────────────────────

def compute_interval_sets(
    stream_data: dict,
    warmup_secs: int,
    reps: int,
    interval_type: str,
    effort_secs: int | None,
    recovery_secs: int | None,
    effort_meters: int | None,
    recovery_meters: int | None,
) -> list[dict[str, Any]]:
    hr_lookup = _build_hr_lookup(stream_data)
    if not hr_lookup:
        return []
    max_offset = max(hr_lookup.keys())

    if interval_type == "distance":
        dist_lookup = _build_distance_lookup(stream_data)
        if not dist_lookup:
            return []
        return _compute_distance_sets(hr_lookup, dist_lookup, max_offset, warmup_secs, reps, effort_meters or 0, recovery_meters or 0)
    else:
        return _compute_time_sets(hr_lookup, max_offset, warmup_secs, reps, effort_secs or 0, recovery_secs or 0)


def _compute_time_sets(
    hr_lookup: dict[int, int],
    max_offset: int,
    warmup_secs: int,
    reps: int,
    effort_secs: int,
    recovery_secs: int,
) -> list[dict[str, Any]]:
    sets: list[dict[str, Any]] = []
    cursor = warmup_secs
    for rep in range(1, reps + 1):
        effort_start = cursor
        effort_end = cursor + effort_secs
        effort_hrs = [hr_lookup[s] for s in range(effort_start, effort_end + 1) if s in hr_lookup]
        peak_hr = max(effort_hrs) if effort_hrs else None
        hrr: dict[int, int | None] = {}
        for t in (30, 60, 90, 120):
            if t >= recovery_secs:
                hrr[t] = None
                continue
            hr = _hr_at(hr_lookup, effort_end + t, max_offset)
            hrr[t] = (peak_hr - hr) if (peak_hr is not None and hr is not None) else None
        sets.append({"set_number": rep, "peak_hr": peak_hr, "hrr30": hrr[30], "hrr60": hrr[60], "hrr90": hrr[90], "hrr120": hrr[120]})
        cursor = effort_end + recovery_secs
    return sets


def _compute_distance_sets(
    hr_lookup: dict[int, int],
    dist_lookup: dict[int, float],
    max_offset: int,
    warmup_secs: int,
    reps: int,
    effort_meters: int,
    recovery_meters: int,
) -> list[dict[str, Any]]:
    sets: list[dict[str, Any]] = []
    # Warmup ends at warmup_secs; find the cumulative distance at that point
    warmup_dist = dist_lookup.get(warmup_secs, 0.0)
    current_dist = warmup_dist
    current_offset = warmup_secs

    for rep in range(1, reps + 1):
        effort_end_offset = _find_offset_at_distance(dist_lookup, current_dist, effort_meters)
        if effort_end_offset is None:
            break

        # Collect HR over the effort window
        effort_hrs = [hr_lookup[s] for s in range(current_offset, effort_end_offset + 1) if s in hr_lookup]
        peak_hr = max(effort_hrs) if effort_hrs else None

        # Advance to end of recovery first so we know the actual elapsed recovery time
        end_dist = dist_lookup.get(effort_end_offset, current_dist + effort_meters)
        recovery_end_offset = _find_offset_at_distance(dist_lookup, end_dist, recovery_meters)
        actual_recovery_secs = (recovery_end_offset - effort_end_offset) if recovery_end_offset is not None else 0

        hrr: dict[int, int | None] = {}
        for t in (30, 60, 90, 120):
            if t >= actual_recovery_secs:
                hrr[t] = None
                continue
            hr = _hr_at(hr_lookup, effort_end_offset + t, max_offset)
            hrr[t] = (peak_hr - hr) if (peak_hr is not None and hr is not None) else None

        sets.append({"set_number": rep, "peak_hr": peak_hr, "hrr30": hrr[30], "hrr60": hrr[60], "hrr90": hrr[90], "hrr120": hrr[120]})

        if recovery_end_offset is None:
            break
        current_dist = dist_lookup.get(recovery_end_offset, end_dist + recovery_meters)
        current_offset = recovery_end_offset

    return sets


# ── Request / Response ────────────────────────────────────────────────────────

class IntervalAnalysisRequest(BaseModel):
    description: str | None = None
    interval_type: Literal["time", "distance"] = "time"
    warmup_secs: int = Field(default=0, ge=0)
    reps: int = Field(ge=1, le=50)
    # time mode
    effort_secs: int | None = Field(default=None, ge=5, le=3600)
    recovery_secs: int | None = Field(default=None, ge=5, le=3600)
    # distance mode
    effort_meters: int | None = Field(default=None, ge=50, le=100000)
    recovery_meters: int | None = Field(default=None, ge=10, le=100000)

    @model_validator(mode="after")
    def _check_fields(self) -> "IntervalAnalysisRequest":
        if self.interval_type == "time":
            if self.effort_secs is None or self.recovery_secs is None:
                raise ValueError("effort_secs and recovery_secs are required for time intervals")
        else:
            if self.effort_meters is None or self.recovery_meters is None:
                raise ValueError("effort_meters and recovery_meters are required for distance intervals")
        return self


def _analysis_to_dict(analysis: IntervalAnalysis) -> dict[str, Any]:
    return {
        "id": analysis.id,
        "activity_id": analysis.activity_id,
        "description": analysis.description,
        "interval_type": analysis.interval_type,
        "warmup_secs": analysis.warmup_secs,
        "reps": analysis.reps,
        "effort_secs": analysis.effort_secs,
        "recovery_secs": analysis.recovery_secs,
        "effort_meters": analysis.effort_meters,
        "recovery_meters": analysis.recovery_meters,
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
        await session.refresh(row, ["sets"])
        return _analysis_to_dict(row)


@router.post("/{activity_id}/interval-analysis")
async def create_interval_analysis(
    activity_id: str,
    body: IntervalAnalysisRequest,
) -> dict[str, Any]:
    async with AsyncSessionLocal() as session:
        activity = await session.get(ActivitySummary, activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")

        if activity.activity_tag not in INTERVAL_TAGS:
            raise HTTPException(
                status_code=422,
                detail=f"Interval analysis only available for: {sorted(INTERVAL_TAGS)}",
            )

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

        set_data = compute_interval_sets(
            stream_data=ts_row.stream_data,
            warmup_secs=body.warmup_secs,
            reps=body.reps,
            interval_type=body.interval_type,
            effort_secs=body.effort_secs,
            recovery_secs=body.recovery_secs,
            effort_meters=body.effort_meters,
            recovery_meters=body.recovery_meters,
        )

        # autobegin is already active from the reads above — just write and commit
        await session.execute(
            delete(IntervalAnalysis).where(IntervalAnalysis.activity_id == activity_id)
        )
        analysis = IntervalAnalysis(
            activity_id=activity_id,
            description=body.description,
            interval_type=body.interval_type,
            warmup_secs=body.warmup_secs,
            reps=body.reps,
            effort_secs=body.effort_secs,
            recovery_secs=body.recovery_secs,
            effort_meters=body.effort_meters,
            recovery_meters=body.recovery_meters,
        )
        session.add(analysis)
        await session.flush()
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
        await session.commit()

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
