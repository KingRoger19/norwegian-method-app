import json
from typing import Any, Literal

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select

from app.config import settings
from models import (
    ActivitySummary,
    ActivityTimeSeries,
    AthleteProfile,
    IntervalAnalysis,
    IntervalSet,
    AsyncSessionLocal,
)

router = APIRouter(prefix="/api/activities", tags=["interval-analysis"])

INTERVAL_TAGS = {"Interval", "Fartlek", "Sprint hills", "Varied tempo run"}


# ── HR lookup ─────────────────────────────────────────────────────────────────

def _build_hr_lookup(stream_data: dict) -> dict[int, int]:
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
    """Return {seconds_from_start: cumulative_distance_meters}. Speed is in m/s."""
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


def _offset_at_distance(dist_lookup: dict[int, float], start_dist: float, target_dist: float) -> int | None:
    threshold = start_dist + target_dist
    for offset in sorted(dist_lookup.keys()):
        if dist_lookup[offset] >= threshold:
            return offset
    return None


# ── Raw speed lookup ──────────────────────────────────────────────────────────

def _build_speed_lookup(stream_data: dict) -> dict[int, float]:
    """Return {seconds_from_start: speed_m_per_s} directly (not cumulative)."""
    timestamps = stream_data.get("timestamps") or []
    speeds = stream_data.get("speed") or []
    if not timestamps:
        return {}
    t0 = timestamps[0]
    return {
        int(ts - t0): float(spd)
        for ts, spd in zip(timestamps, speeds)
        if spd is not None
    }


def _auto_speed_threshold(speeds: list[float]) -> float | None:
    """Find the natural gap between effort and recovery speeds.

    Sorts all speed values and returns the midpoint of the largest gap.
    For interval training the speed distribution is bimodal (slow recovery,
    fast effort) and the largest gap separates the two clusters reliably.
    """
    valid = sorted(s for s in speeds if s > 0.3)   # exclude near-standstill
    if len(valid) < 30:
        return None
    max_gap = 0.0
    threshold = valid[len(valid) // 2]              # fallback: median
    for i in range(len(valid) - 1):
        gap = valid[i + 1] - valid[i]
        if gap > max_gap:
            max_gap = gap
            threshold = (valid[i] + valid[i + 1]) / 2.0
    # Sanity: threshold must be meaningful (> 1 m/s, < 7 m/s)
    return threshold if 1.0 < threshold < 7.0 else None


# ── Generic signal smoother ───────────────────────────────────────────────────

def _smooth_signal(lookup: dict[int, float], window: int = 10) -> dict[int, float]:
    offsets = sorted(lookup.keys())
    n = len(offsets)
    if n == 0:
        return {}
    half = window // 2
    smoothed = {}
    for i, t in enumerate(offsets):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        vals = [lookup[offsets[j]] for j in range(lo, hi)]
        smoothed[t] = sum(vals) / len(vals)
    return smoothed


def _smooth_hr(hr_lookup: dict[int, int], window: int = 15) -> dict[int, float]:
    return _smooth_signal({k: float(v) for k, v in hr_lookup.items()}, window)


# ── Computation: manual mode (mixed per-field units) ─────────────────────────

def _resolve_warmup_offset(
    warmup_value: int,
    warmup_unit: str,
    dist_lookup: dict[int, float] | None,
) -> int:
    if warmup_unit == "m" and dist_lookup is not None:
        return _offset_at_distance(dist_lookup, 0.0, warmup_value) or 0
    return warmup_value


def _compute_manual_sets(
    hr_lookup: dict[int, int],
    dist_lookup: dict[int, float] | None,
    max_offset: int,
    warmup_offset: int,
    reps: int,
    effort_value: int,
    effort_unit: str,
    recovery_value: int,
    recovery_unit: str,
) -> list[dict[str, Any]]:
    sets: list[dict[str, Any]] = []
    cursor = warmup_offset
    cursor_dist = dist_lookup.get(cursor, 0.0) if dist_lookup else 0.0

    for rep in range(1, reps + 1):
        effort_start = cursor

        # --- Effort end ---
        if effort_unit == "m" and dist_lookup is not None:
            effort_end = _offset_at_distance(dist_lookup, cursor_dist, effort_value)
            if effort_end is None:
                break
        else:
            effort_end = cursor + effort_value

        effort_hrs = [hr_lookup[s] for s in range(effort_start, effort_end + 1) if s in hr_lookup]
        peak_hr = max(effort_hrs) if effort_hrs else None

        # --- Recovery end ---
        if recovery_unit == "m" and dist_lookup is not None:
            effort_end_dist = dist_lookup.get(effort_end, cursor_dist + effort_value)
            recovery_end = _offset_at_distance(dist_lookup, effort_end_dist, recovery_value)
            actual_recovery_secs = (recovery_end - effort_end) if recovery_end is not None else 0
        else:
            recovery_end = effort_end + recovery_value
            actual_recovery_secs = recovery_value

        # --- HRR ---
        hrr: dict[int, int | None] = {}
        for t in (30, 60, 90, 120):
            if t > actual_recovery_secs:
                hrr[t] = None
                continue
            hr = _hr_at(hr_lookup, effort_end + t, max_offset)
            hrr[t] = (peak_hr - hr) if (peak_hr is not None and hr is not None) else None

        sets.append({
            "set_number": rep,
            "effort_duration_secs": None,
            "recovery_duration_secs": None,
            "peak_hr": peak_hr,
            "hrr30": hrr[30],
            "hrr60": hrr[60],
            "hrr90": hrr[90],
            "hrr120": hrr[120],
        })

        if recovery_unit == "m" and dist_lookup is not None:
            if recovery_end is None:
                break
            cursor = recovery_end
            cursor_dist = dist_lookup.get(recovery_end, 0.0)
        else:
            cursor = effort_end + recovery_value
            if dist_lookup:
                cursor_dist = dist_lookup.get(cursor, cursor_dist)

    return sets


# ── Computation: auto-detect mode ─────────────────────────────────────────────

def _find_efforts(
    smoothed: dict[int, float],
    threshold: float,
    warmup_offset: int,
    end_secs: int,
    min_effort_secs: int,
    min_recovery_secs: int,
) -> list[tuple[int, int]]:
    """Core segmentation: find (start, end) of each effort above threshold."""
    offsets = sorted(o for o in smoothed if warmup_offset <= o <= end_secs)
    if not offsets:
        return []

    runs: list[list[int]] = []
    run_start = None
    for t in offsets:
        if smoothed[t] >= threshold:
            if run_start is None:
                run_start = t
        else:
            if run_start is not None:
                runs.append([run_start, t - 1])
                run_start = None
    if run_start is not None:
        runs.append([run_start, offsets[-1]])

    # Merge adjacent runs separated by a gap shorter than min_recovery_secs
    # (handles brief slowdowns / HR dips that don't mark a true recovery)
    merged: list[list[int]] = []
    for run in runs:
        if merged and (run[0] - merged[-1][1]) < min_recovery_secs:
            merged[-1][1] = run[1]
        else:
            merged.append(run[:])

    return [(s, e) for s, e in merged if (e - s) >= min_effort_secs]


def _detect_intervals_auto(
    stream_data: dict,
    warmup_offset: int,
    cooldown_secs: int,
    effort_hr_threshold: int,
    min_effort_secs: int = 20,
    min_recovery_secs: int = 15,
) -> list[dict[str, Any]]:
    hr_lookup = _build_hr_lookup(stream_data)
    if not hr_lookup:
        return []

    max_offset = max(hr_lookup.keys())
    end_secs = max_offset - cooldown_secs

    # ── Prefer speed-based detection ──────────────────────────────────────────
    # HR lags pace by 15-30 s. For short recoveries (≤90 s) HR often stays
    # above LT2 the whole time, making HR-only detection unreliable.
    # Speed changes are instantaneous: easy to separate effort (~4 m/s) from
    # recovery (~1.5 m/s) even with only 80 s rest.
    efforts: list[tuple[int, int]] = []
    used_speed = False

    speed_lookup = _build_speed_lookup(stream_data)
    if speed_lookup and len(speed_lookup) > 100:
        speeds_in_window = [
            speed_lookup[t]
            for t in sorted(speed_lookup.keys())
            if warmup_offset <= t <= end_secs
        ]
        spd_threshold = _auto_speed_threshold(speeds_in_window)
        if spd_threshold is not None:
            smoothed_spd = _smooth_signal(speed_lookup, window=10)
            efforts = _find_efforts(
                smoothed_spd, spd_threshold,
                warmup_offset, end_secs,
                min_effort_secs, min_recovery_secs,
            )
            used_speed = True

    # ── Fallback: HR-based detection ──────────────────────────────────────────
    if not used_speed or not efforts:
        smoothed_hr = _smooth_hr(hr_lookup, window=15)
        efforts = _find_efforts(
            smoothed_hr, float(effort_hr_threshold),
            warmup_offset, end_secs,
            min_effort_secs, min_recovery_secs,
        )

    if not efforts:
        return []

    sets: list[dict[str, Any]] = []
    for i, (effort_start, effort_end) in enumerate(efforts):
        effort_hrs = [hr_lookup[s] for s in range(effort_start, effort_end + 1) if s in hr_lookup]
        peak_hr = max(effort_hrs) if effort_hrs else None
        effort_duration = effort_end - effort_start

        next_start = efforts[i + 1][0] if i + 1 < len(efforts) else end_secs
        recovery_duration = next_start - effort_end

        hrr: dict[int, int | None] = {}
        for t in (30, 60, 90, 120):
            if t > recovery_duration:
                hrr[t] = None
                continue
            hr = _hr_at(hr_lookup, effort_end + t, max_offset)
            hrr[t] = (peak_hr - hr) if (peak_hr is not None and hr is not None) else None

        sets.append({
            "set_number": i + 1,
            "effort_duration_secs": effort_duration,
            "recovery_duration_secs": recovery_duration if i + 1 < len(efforts) else None,
            "peak_hr": peak_hr,
            "hrr30": hrr[30],
            "hrr60": hrr[60],
            "hrr90": hrr[90],
            "hrr120": hrr[120],
        })

    return sets


# ── Request / Response ────────────────────────────────────────────────────────

Unit = Literal["s", "min", "m", "km"]


def _to_base(value: int, unit: str) -> tuple[int, str]:
    """Convert min→s (*60) and km→m (*1000); return (base_value, base_unit)."""
    if unit == "min":
        return value * 60, "s"
    if unit == "km":
        return value * 1000, "m"
    return value, unit


class IntervalAnalysisRequest(BaseModel):
    description: str | None = None
    interval_type: Literal["manual", "auto"] = "manual"
    reps: int | None = Field(default=None, ge=1, le=50)
    warmup_value: int = Field(default=0, ge=0)
    warmup_unit: Unit = "s"
    cooldown_value: int = Field(default=0, ge=0)
    cooldown_unit: Unit = "s"
    effort_value: int | None = Field(default=None, ge=1)
    effort_unit: Unit = "s"
    recovery_value: int | None = Field(default=None, ge=1)
    recovery_unit: Unit = "s"
    effort_hr_threshold: int | None = Field(default=None, ge=100, le=220)

    @model_validator(mode="after")
    def _check_fields(self) -> "IntervalAnalysisRequest":
        if self.interval_type == "manual":
            if self.reps is None:
                raise ValueError("reps is required for manual intervals")
            if self.effort_value is None:
                raise ValueError("effort_value is required for manual intervals")
            if self.recovery_value is None:
                raise ValueError("recovery_value is required for manual intervals")
        return self


def _analysis_to_dict(a: IntervalAnalysis) -> dict[str, Any]:
    return {
        "id": a.id,
        "activity_id": a.activity_id,
        "description": a.description,
        "interval_type": a.interval_type,
        "reps": a.reps,
        "warmup_value": a.warmup_value,
        "warmup_unit": a.warmup_unit,
        "cooldown_value": a.cooldown_value,
        "cooldown_unit": a.cooldown_unit,
        "effort_value": a.effort_value,
        "effort_unit": a.effort_unit,
        "recovery_value": a.recovery_value,
        "recovery_unit": a.recovery_unit,
        "effort_hr_threshold": a.effort_hr_threshold,
        "created_at": a.created_at.isoformat(),
        "sets": [
            {
                "set_number": s.set_number,
                "effort_duration_secs": s.effort_duration_secs,
                "recovery_duration_secs": s.recovery_duration_secs,
                "peak_hr": s.peak_hr,
                "hrr30": s.hrr30,
                "hrr60": s.hrr60,
                "hrr90": s.hrr90,
                "hrr120": s.hrr120,
            }
            for s in a.sets
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
            raise HTTPException(status_code=422, detail=f"Interval analysis only available for: {sorted(INTERVAL_TAGS)}")

        ts_row = (
            await session.execute(
                select(ActivityTimeSeries).where(ActivityTimeSeries.activity_id == activity_id)
            )
        ).scalar_one_or_none()
        if ts_row is None:
            raise HTTPException(status_code=422, detail="No per-second data. Upload the .fit file first.")

        # Resolve threshold for auto mode
        threshold = body.effort_hr_threshold
        if body.interval_type == "auto" and threshold is None:
            profile = await session.get(AthleteProfile, 1)
            if profile and profile.lt2_hr:
                threshold = profile.lt2_hr
            else:
                raise HTTPException(status_code=422, detail="Set LT2 in Athlete Profile or provide effort_hr_threshold.")

        stream = ts_row.stream_data
        hr_lookup = _build_hr_lookup(stream)
        if not hr_lookup:
            raise HTTPException(status_code=422, detail="No heart rate data in this activity's stream.")
        max_offset = max(hr_lookup.keys())

        # Normalise min→s and km→m for computation (originals stored in DB)
        wu_val, wu_unit = _to_base(body.warmup_value, body.warmup_unit)
        cd_val, cd_unit = _to_base(body.cooldown_value, body.cooldown_unit)
        ef_val = _to_base(body.effort_value, body.effort_unit) if body.effort_value is not None else (None, body.effort_unit)
        rv_val = _to_base(body.recovery_value, body.recovery_unit) if body.recovery_value is not None else (None, body.recovery_unit)
        ef_value, ef_unit = ef_val
        rv_value, rv_unit = rv_val

        # Build distance lookup only if any field resolves to meters
        needs_dist = any(u == "m" for u in [wu_unit, cd_unit, ef_unit, rv_unit])
        dist_lookup = _build_distance_lookup(stream) if needs_dist else None

        warmup_offset = _resolve_warmup_offset(wu_val, wu_unit, dist_lookup)

        if body.interval_type == "auto":
            if cd_unit == "m" and dist_lookup:
                total_dist = max(dist_lookup.values())
                cooldown_start = _offset_at_distance(dist_lookup, total_dist - cd_val, 0) or max_offset
                cooldown_secs = max_offset - cooldown_start
            else:
                cooldown_secs = cd_val
            set_data = _detect_intervals_auto(stream, warmup_offset, cooldown_secs, threshold)
            if not set_data:
                raise HTTPException(status_code=422, detail=f"No intervals detected above {threshold} bpm. Try a lower threshold or adjust warmup/cooldown.")
        else:
            set_data = _compute_manual_sets(
                hr_lookup=hr_lookup,
                dist_lookup=dist_lookup,
                max_offset=max_offset,
                warmup_offset=warmup_offset,
                reps=body.reps,
                effort_value=ef_value,
                effort_unit=ef_unit,
                recovery_value=rv_value,
                recovery_unit=rv_unit,
            )

        await session.execute(delete(IntervalAnalysis).where(IntervalAnalysis.activity_id == activity_id))
        analysis = IntervalAnalysis(
            activity_id=activity_id,
            description=body.description,
            interval_type=body.interval_type,
            reps=body.reps,
            warmup_value=body.warmup_value,
            warmup_unit=body.warmup_unit,
            cooldown_value=body.cooldown_value,
            cooldown_unit=body.cooldown_unit,
            effort_value=body.effort_value,
            effort_unit=body.effort_unit,
            recovery_value=body.recovery_value,
            recovery_unit=body.recovery_unit,
            effort_hr_threshold=threshold,
        )
        session.add(analysis)
        await session.flush()
        for s in set_data:
            session.add(IntervalSet(
                analysis_id=analysis.id,
                set_number=s["set_number"],
                effort_duration_secs=s["effort_duration_secs"],
                recovery_duration_secs=s["recovery_duration_secs"],
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


# ── LLM helpers ───────────────────────────────────────────────────────────────

_PARSE_SYSTEM = """\
You extract structured interval workout parameters from natural-language descriptions.
Respond with a single JSON object — no prose, no markdown fences.
Fields (all optional unless stated):
  reps          integer  — number of repetitions (required)
  effort_value  integer  — effort duration (seconds) or distance (meters)
  effort_unit   "s"|"m"  — required if effort_value present
  recovery_value integer — recovery duration or distance
  recovery_unit "s"|"m"  — required if recovery_value present
If you cannot determine a field, omit it.
"""

_COMMENTARY_SYSTEM = """\
You are a running coach interpreting heart-rate-recovery (HRR) data.
HRR_t = peak HR minus HR at t seconds after effort end. Higher = faster recovery.
Write 2-3 concise sentences: overall quality assessment, any trend across sets,
and one actionable takeaway. No bullet points. Plain text only.
"""


async def _parse_workout_description(description: str) -> dict[str, Any]:
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured.")
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            system=_PARSE_SYSTEM,
            messages=[{"role": "user", "content": description}],
        )
    except anthropic.BadRequestError as e:
        detail = str(e)
        if "credit balance" in detail.lower():
            raise HTTPException(status_code=402, detail="Anthropic API: insufficient credits. Add credits at console.anthropic.com → Plans & Billing.")
        raise HTTPException(status_code=400, detail=f"Anthropic API error: {detail}")
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=503, detail="Anthropic API key is invalid or expired.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="Could not reach Anthropic API. Check your internet connection.")
    raw = msg.content[0].text.strip()
    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return json.loads(raw)


async def _generate_commentary(
    workout_text: str,
    sets: list[dict[str, Any]],
    lt2_hr: int | None,
) -> str:
    if not settings.anthropic_api_key:
        return ""
    summary_lines = []
    for s in sets:
        parts = [f"Set {s['set_number']}: peak {s['peak_hr']} bpm"]
        for col in ("hrr30", "hrr60", "hrr90", "hrr120"):
            if s.get(col) is not None:
                parts.append(f"HRR{col[3:]}={s[col]}")
        summary_lines.append(", ".join(parts))
    context = (
        f"Athlete LT2: {lt2_hr} bpm\n"
        f"Workout: {workout_text}\n"
        f"Results:\n" + "\n".join(summary_lines)
    )
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=_COMMENTARY_SYSTEM,
        messages=[{"role": "user", "content": context}],
    )
    return msg.content[0].text.strip()


# ── Describe endpoint ─────────────────────────────────────────────────────────

class DescribeRequest(BaseModel):
    natural_description: str = Field(min_length=5, max_length=500)
    warmup_value: int = Field(default=0, ge=0)
    warmup_unit: Unit = "s"
    cooldown_value: int = Field(default=0, ge=0)
    cooldown_unit: Unit = "s"


@router.post("/{activity_id}/interval-analysis/from-description")
async def analyze_from_description(
    activity_id: str,
    body: DescribeRequest,
) -> dict[str, Any]:
    async with AsyncSessionLocal() as session:
        activity = await session.get(ActivitySummary, activity_id)
        if not activity:
            raise HTTPException(status_code=404, detail="Activity not found")
        if activity.activity_tag not in INTERVAL_TAGS:
            raise HTTPException(status_code=422, detail=f"Interval analysis only available for: {sorted(INTERVAL_TAGS)}")

        ts_row = (
            await session.execute(
                select(ActivityTimeSeries).where(ActivityTimeSeries.activity_id == activity_id)
            )
        ).scalar_one_or_none()
        if ts_row is None:
            raise HTTPException(status_code=422, detail="No per-second data. Upload the .fit file first.")

        profile = await session.get(AthleteProfile, 1)
        lt2_hr = profile.lt2_hr if profile else None

    # ── LLM parse ─────────────────────────────────────────────────────────────
    try:
        parsed = await _parse_workout_description(body.natural_description)
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(
            status_code=422,
            detail="Could not parse the workout description. Try being more specific, e.g. '10×400m fast, 90s rest'.",
        )

    reps = parsed.get("reps")
    effort_value = parsed.get("effort_value")
    effort_unit = parsed.get("effort_unit", "s")
    recovery_value = parsed.get("recovery_value")
    recovery_unit = parsed.get("recovery_unit", "s")

    if not reps or not effort_value or not recovery_value:
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract reps/effort/recovery from: '{body.natural_description}'. Try '12×1000m fast, 80s rest'.",
        )

    # ── Compute ───────────────────────────────────────────────────────────────
    stream = ts_row.stream_data
    hr_lookup = _build_hr_lookup(stream)
    if not hr_lookup:
        raise HTTPException(status_code=422, detail="No heart rate data in this activity's stream.")
    max_offset = max(hr_lookup.keys())

    # Normalise all units to base (s / m)
    wu_val, wu_unit = _to_base(body.warmup_value, body.warmup_unit)
    cd_val, cd_unit = _to_base(body.cooldown_value, body.cooldown_unit)
    ef_value, ef_unit = _to_base(effort_value, effort_unit)
    rv_value, rv_unit = _to_base(recovery_value, recovery_unit)

    needs_dist = any(u == "m" for u in [wu_unit, cd_unit, ef_unit, rv_unit])
    dist_lookup = _build_distance_lookup(stream) if needs_dist else None

    warmup_offset = _resolve_warmup_offset(wu_val, wu_unit, dist_lookup)

    set_data = _compute_manual_sets(
        hr_lookup=hr_lookup,
        dist_lookup=dist_lookup,
        max_offset=max_offset,
        warmup_offset=warmup_offset,
        reps=reps,
        effort_value=ef_value,
        effort_unit=ef_unit,
        recovery_value=rv_value,
        recovery_unit=rv_unit,
    )

    # ── LLM commentary ────────────────────────────────────────────────────────
    commentary = await _generate_commentary(body.natural_description, set_data, lt2_hr)

    # ── Persist ───────────────────────────────────────────────────────────────
    async with AsyncSessionLocal() as session:
        await session.execute(delete(IntervalAnalysis).where(IntervalAnalysis.activity_id == activity_id))
        analysis = IntervalAnalysis(
            activity_id=activity_id,
            description=body.natural_description,
            interval_type="manual",
            reps=reps,
            warmup_value=body.warmup_value,
            warmup_unit=body.warmup_unit,
            cooldown_value=body.cooldown_value,
            cooldown_unit=body.cooldown_unit,
            effort_value=effort_value,
            effort_unit=effort_unit,
            recovery_value=recovery_value,
            recovery_unit=recovery_unit,
        )
        session.add(analysis)
        await session.flush()
        for s in set_data:
            session.add(IntervalSet(
                analysis_id=analysis.id,
                set_number=s["set_number"],
                effort_duration_secs=s["effort_duration_secs"],
                recovery_duration_secs=s["recovery_duration_secs"],
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
            result = _analysis_to_dict(fresh)
            result["analysis_text"] = commentary
            return result
