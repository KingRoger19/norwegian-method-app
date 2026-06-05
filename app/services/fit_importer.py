import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from garmin_fit_sdk import Decoder, Stream
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.services.ingestion import _refresh_double_threshold
from models import ActivitySummary, ActivityTimeSeries, AsyncSessionLocal, DailyMetrics

logger = logging.getLogger(__name__)

SEMICIRCLE_TO_DEG = 180.0 / (2**31)


# ── result container ──────────────────────────────────────────────────────────

@dataclass
class ImportResult:
    total_files: int = 0
    imported: int = 0
    updated: int = 0    # already existed; now enriched with .fit biomechanics
    skipped: int = 0    # parse error or no session message
    errors: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if not self.errors:
            return "success"
        if self.imported + self.updated:
            return "partial"
        return "failed"


# ── parsing helpers ───────────────────────────────────────────────────────────

def _clean(v: Any) -> Any:
    """Replace float NaN/Inf (not valid JSON) with None."""
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def _avg_nonzero(lst: list) -> float | None:
    vals = [v for v in lst if v is not None and v != 0.0]
    return sum(vals) / len(vals) if vals else None


def _build_stream(record_mesgs: list[dict]) -> dict:
    """Build the JSONB stream_data payload from per-second record messages."""
    ts_list: list[int] = []
    hr: list = []
    pwr: list = []
    spd: list = []
    epace: list = []
    ll: list = []
    alt: list = []
    cad: list = []
    st: list = []
    vo: list = []
    vr: list = []
    sl: list = []

    for rec in record_mesgs:
        raw_ts = rec.get("timestamp")
        if not isinstance(raw_ts, datetime):
            continue
        ts_list.append(int(raw_ts.timestamp()))

        hr.append(_clean(rec.get("heart_rate")))
        pwr.append(_clean(rec.get("power")))
        spd.append(_clean(rec.get("enhanced_speed") or rec.get("speed")))

        # Effort Pace lives in developer_fields[0]
        dev = rec.get("developer_fields") or {}
        epace.append(_clean(dev.get(0)))

        lat = rec.get("position_lat")
        lon = rec.get("position_long")
        if lat is not None and lon is not None and math.isfinite(lat) and math.isfinite(lon):
            ll.append([
                round(lat * SEMICIRCLE_TO_DEG, 6),
                round(lon * SEMICIRCLE_TO_DEG, 6),
            ])
        else:
            ll.append(None)

        alt.append(_clean(rec.get("enhanced_altitude") or rec.get("altitude")))
        cad.append(_clean(rec.get("cadence")))
        st.append(_clean(rec.get("stance_time")))
        vo.append(_clean(rec.get("vertical_oscillation")))
        vr.append(_clean(rec.get("vertical_ratio")))
        sl.append(_clean(rec.get("step_length")))

    stream: dict = {"timestamps": ts_list}

    def add(key: str, lst: list) -> None:
        if any(v is not None for v in lst):
            stream[key] = lst

    add("heart_rate", hr)
    add("power", pwr)
    add("speed", spd)
    add("effort_pace", epace)
    add("lat_long", ll)
    add("altitude", alt)
    add("cadence", cad)
    add("stance_time", st)
    add("vertical_oscillation", vo)
    add("vertical_ratio", vr)
    add("step_length", sl)

    return stream


def _compute_zones(
    hr_series: list, lthr: int | None, lt1_ratio: float
) -> tuple[int, int, int]:
    if not lthr:
        return 0, 0, 0
    lt1 = lthr * lt1_ratio
    z1 = z2 = z3 = 0
    for hr in hr_series:
        if hr is None:
            continue
        if hr < lt1:
            z1 += 1
        elif hr < lthr:
            z2 += 1
        else:
            z3 += 1
    return z1, z2, z3


def _parse_fit(filepath: Path, lthr: int | None) -> dict | None:
    """Parse one .fit file with the Garmin SDK. Returns a dict for DB insertion, or None."""
    try:
        stream = Stream.from_file(str(filepath))
        decoder = Decoder(stream)
        messages, _ = decoder.read(
            apply_scale_and_offset=True,
            convert_datetimes_to_dates=True,
        )
    except Exception as exc:
        logger.debug("parse error %s: %s", filepath.name, exc)
        return None

    sessions = messages.get("session_mesgs", [])
    if not sessions:
        return None
    records = messages.get("record_mesgs", [])

    sess = sessions[0]
    activity_id = filepath.stem

    start_time: datetime | None = sess.get("start_time")
    if not isinstance(start_time, datetime):
        return None
    # Garmin SDK already gives timezone-aware UTC datetimes
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)

    activity_date: date = start_time.date()
    sport: str = str(sess.get("sport", ""))
    is_running = sport == "running"

    duration_s = int(sess.get("total_timer_time") or sess.get("total_elapsed_time") or 0)
    distance_m = float(sess.get("total_distance") or 0)
    avg_hr = sess.get("avg_heart_rate") or None
    max_hr = sess.get("max_heart_rate") or None
    avg_power = sess.get("avg_power") or None
    np_raw = sess.get("normalized_power")
    normalized_power = int(np_raw) if np_raw else None

    total_ascent = sess.get("total_ascent")
    total_descent = sess.get("total_descent")

    # Cadence: running stores one-foot spm (avg_running_cadence or avg_cadence) → ×2 for full spm
    if is_running:
        raw_cad = sess.get("avg_running_cadence") or sess.get("avg_cadence")
    else:
        raw_cad = sess.get("avg_cadence")
    avg_cadence = raw_cad * 2 if raw_cad else None

    # Stride length: avg_step_length in mm → metres (running only)
    avg_stride_length = None
    if is_running and sess.get("avg_step_length"):
        avg_stride_length = sess["avg_step_length"] / 1000.0

    # Biomechanics from per-second records (session avg is often 0 in Coros firmware)
    st_vals  = [r["stance_time"]           for r in records if r.get("stance_time")]
    vo_vals  = [r["vertical_oscillation"]  for r in records if r.get("vertical_oscillation")]
    vr_vals  = [r["vertical_ratio"]        for r in records if r.get("vertical_ratio")]

    ground_time    = _avg_nonzero(st_vals)   # ms
    stride_height  = _avg_nonzero(vo_vals)   # mm
    stride_ratio   = _avg_nonzero(vr_vals)   # %

    # vertical speed: total ascent per minute of active time
    vertical_speed = None
    if total_ascent and duration_s:
        vertical_speed = round(total_ascent / (duration_s / 60), 3)

    pct_of_hr_max = None
    if avg_hr and settings.user_max_hr:
        pct_of_hr_max = round(avg_hr / settings.user_max_hr * 100, 2)

    stream = _build_stream(records)
    hr_series = stream.get("heart_rate", [])
    zone1, zone2, zone3 = _compute_zones(hr_series, lthr, settings.lt1_lthr_ratio)

    summary_row = {
        "activity_id": activity_id,
        "date": activity_date,
        "start_time": start_time,
        "duration_seconds": duration_s,
        "distance_meters": distance_m,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "pct_of_hr_max": pct_of_hr_max,
        "avg_power": avg_power,
        "normalized_power": normalized_power,
        "avg_cadence": avg_cadence,
        "avg_stride_length": avg_stride_length,
        "ground_time": ground_time,
        "stride_height": stride_height,
        "stride_ratio": stride_ratio,
        "total_ascent": total_ascent,
        "total_descent": total_descent,
        "vertical_speed": vertical_speed,
        "zone1_secs": zone1,
        "zone2_secs": zone2,
        "zone3_secs": zone3,
    }

    return {
        "activity_id": activity_id,
        "date": activity_date,
        "summary": summary_row,
        "stream": stream,
    }


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _ensure_daily_metrics_rows(session, dates: set[date]) -> None:
    if not dates:
        return
    existing = {
        row[0]
        for row in (await session.execute(select(DailyMetrics.date))).all()
    }
    missing = [{"date": d} for d in dates if d not in existing]
    if missing:
        await session.execute(
            insert(DailyMetrics).values(missing).on_conflict_do_nothing()
        )


async def _upsert_summaries(session, rows: list[dict]) -> tuple[int, int]:
    if not rows:
        return 0, 0
    existing_ids = {
        row[0]
        for row in (
            await session.execute(
                select(ActivitySummary.activity_id).where(
                    ActivitySummary.activity_id.in_([r["activity_id"] for r in rows])
                )
            )
        ).all()
    }
    stmt = insert(ActivitySummary).values(rows)
    update_cols = {k: stmt.excluded[k] for k in rows[0] if k != "activity_id"}
    stmt = stmt.on_conflict_do_update(index_elements=["activity_id"], set_=update_cols)
    await session.execute(stmt)
    new = sum(1 for r in rows if r["activity_id"] not in existing_ids)
    return new, len(rows) - new


async def _upsert_time_series(session, rows: list[dict]) -> None:
    if not rows:
        return
    stmt = insert(ActivityTimeSeries).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["activity_id"],
        set_={"stream_data": stmt.excluded.stream_data},
    )
    await session.execute(stmt)


# ── main entry point ──────────────────────────────────────────────────────────

BATCH_SIZE = 50


async def run_fit_import(fit_dir: str, progress_callback: Any = None) -> ImportResult:
    result = ImportResult()
    files = sorted(Path(fit_dir).glob("*.fit"))
    result.total_files = len(files)
    if not files:
        return result

    # Pre-load LTHR for all known dates
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(DailyMetrics.date, DailyMetrics.lactate_threshold_hr)
        )).all()
    lthr_by_date: dict[date, int | None] = {r[0]: r[1] for r in rows}

    for batch_start in range(0, len(files), BATCH_SIZE):
        batch = files[batch_start: batch_start + BATCH_SIZE]
        summary_rows: list[dict] = []
        stream_rows: list[dict] = []
        dates_in_batch: set[date] = set()

        for filepath in batch:
            activity_date_hint = None  # resolved after parsing
            parsed = _parse_fit(filepath, None)  # lthr filled below after date is known

            if parsed is None:
                result.skipped += 1
                result.errors.append(f"parse failed: {filepath.name}")
                continue

            activity_date: date = parsed["date"]
            # Recompute zones with the correct LTHR for this activity's date
            lthr = lthr_by_date.get(activity_date)
            hr_series = parsed["stream"].get("heart_rate", [])
            z1, z2, z3 = _compute_zones(hr_series, lthr, settings.lt1_lthr_ratio)
            parsed["summary"]["zone1_secs"] = z1
            parsed["summary"]["zone2_secs"] = z2
            parsed["summary"]["zone3_secs"] = z3

            summary_rows.append(parsed["summary"])
            if parsed["stream"].get("timestamps"):
                stream_rows.append({
                    "activity_id": parsed["activity_id"],
                    "stream_data": parsed["stream"],
                })
            dates_in_batch.add(activity_date)

        if not summary_rows:
            continue

        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    await _ensure_daily_metrics_rows(session, dates_in_batch)
                    new, updated = await _upsert_summaries(session, summary_rows)
                    await _upsert_time_series(session, stream_rows)
                    await _refresh_double_threshold(session, dates_in_batch)

            result.imported += new
            result.updated += updated
        except Exception as exc:
            msg = f"DB error batch {batch_start}–{batch_start + len(batch)}: {exc}"
            logger.error(msg)
            result.errors.append(msg)
            result.skipped += len(summary_rows)

        if progress_callback:
            progress_callback(batch_start + len(batch), result.total_files, result)

        logger.info(
            "fit import %d/%d — imported=%d updated=%d skipped=%d",
            batch_start + len(batch), result.total_files,
            result.imported, result.updated, result.skipped,
        )

    return result
