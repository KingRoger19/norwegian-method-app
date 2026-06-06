import logging
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.athlete import effective_max_hr, load_profile
from app.services.coros_client import (
    ActivityDetailRecord,
    ActivitySummaryRecord,
    CorosSleepRecord,
    DailyMetricRecord,
    coros_client,
)
from models import ActivitySummary, AsyncSessionLocal, DailyMetrics, SleepRecord

logger = logging.getLogger(__name__)


def _to_date(s: str) -> date:
    """Parse an ISO date string to a Python date object."""
    return date.fromisoformat(s)


def _to_datetime(s: str) -> datetime | None:
    """Parse various timestamp formats from coros-mcp to a timezone-naive datetime.
    Handles ISO strings; returns None if the value is empty or unparseable.
    """
    if not s:
        return None
    try:
        # ISO 8601 with or without timezone
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _map_coros_zones_to_norwegian(hr_zones: list[dict] | None) -> tuple[int, int, int]:
    """
    Map Coros 5-zone HR distribution to Norwegian 3-zone model.

    Coros zones are LTHR-relative:
      Z1 (<75% LTHR) + Z2 (75-88%)  →  Norwegian Z1 (easy base, below LT1)
      Z3 (88-96%)    + Z4 (96-100%) →  Norwegian Z2 (threshold sweet-spot, LT1–LT2)
      Z5 (>100% LTHR)               →  Norwegian Z3 (VO2max, above LT2)

    This is a best-effort approximation; will be superseded by per-second .fit data.
    Returns (zone1_secs, zone2_secs, zone3_secs).
    """
    if not hr_zones:
        return 0, 0, 0

    zone_map: dict[int, int] = {}
    for z in hr_zones:
        num = z.get("zone_number") or z.get("zone") or z.get("hr_zone") or z.get("zoneNumber")
        secs = z.get("seconds") or z.get("time") or z.get("duration_seconds") or z.get("durationSeconds") or 0
        if num is not None:
            zone_map[int(num)] = int(secs)

    if not zone_map:
        return 0, 0, 0

    norwegian_z1 = zone_map.get(1, 0) + zone_map.get(2, 0)
    norwegian_z2 = zone_map.get(3, 0) + zone_map.get(4, 0)
    norwegian_z3 = zone_map.get(5, 0)
    return norwegian_z1, norwegian_z2, norwegian_z3


async def _upsert_daily_metrics(session: AsyncSession, records: list[DailyMetricRecord]) -> int:
    if not records:
        return 0
    rows = [
        {
            "date": _to_date(r.date),
            "hrv_today": r.avg_sleep_hrv,
            "hrv_baseline": r.hrv_baseline,
            "resting_heart_rate": r.rhr,
            "training_load": r.training_load,
            "training_load_ratio": r.training_load_ratio,
            "tired_rate": r.tired_rate,
            "vo2max": r.vo2max,
            "lactate_threshold_hr": r.lthr,
        }
        for r in records
    ]
    stmt = insert(DailyMetrics).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["date"],
        set_={k: stmt.excluded[k] for k in rows[0] if k != "date"},
    )
    await session.execute(stmt)
    return len(rows)


async def _upsert_sleep_records(session: AsyncSession, records: list[CorosSleepRecord]) -> int:
    if not records:
        return 0
    existing_dates = {
        row[0].isoformat()
        for row in (await session.execute(select(DailyMetrics.date))).all()
    }
    rows = [
        {
            "date": _to_date(r.date),
            "total_duration_mins": r.total_duration_minutes,
            "deep_mins": r.deep_minutes,
            "rem_mins": r.rem_minutes,
            "quality_score": r.quality_score,
        }
        for r in records
        if r.date in existing_dates
    ]
    if not rows:
        return 0
    stmt = insert(SleepRecord).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["date"],
        set_={k: stmt.excluded[k] for k in rows[0] if k != "date"},
    )
    await session.execute(stmt)
    return len(rows)


async def _upsert_activity(
    session: AsyncSession,
    summary: ActivitySummaryRecord,
    detail: ActivityDetailRecord,
    lthr_by_date: dict[str, int | None],
    max_hr: int | None,
) -> None:
    zone1, zone2, zone3 = _map_coros_zones_to_norwegian(detail.hr_zones)

    pct_of_hr_max = None
    if summary.avg_hr and max_hr:
        pct_of_hr_max = round((summary.avg_hr / max_hr) * 100, 2)

    max_hr = summary.max_hr or detail.max_hr

    row = {
        "activity_id": summary.activity_id,
        "date": _to_date(summary.date),
        "start_time": _to_datetime(summary.start_time),
        "duration_seconds": summary.duration_seconds,
        "distance_meters": summary.distance_meters,
        "avg_hr": summary.avg_hr,
        "max_hr": max_hr,
        "pct_of_hr_max": pct_of_hr_max,
        "avg_power": summary.avg_power,
        "normalized_power": summary.normalized_power,
        "total_ascent": summary.elevation_gain,
        "avg_cadence": detail.avg_cadence,
        "ground_time": detail.ground_time,
        "stride_height": detail.stride_height,
        "stride_ratio": detail.stride_ratio,
        "avg_stride_length": detail.avg_stride_length,
        "vertical_speed": detail.vertical_speed,
        "zone1_secs": zone1,
        "zone2_secs": zone2,
        "zone3_secs": zone3,
    }

    stmt = insert(ActivitySummary).values(**row)
    update_cols = {k: stmt.excluded[k] for k in row if k not in ("activity_id", "max_hr")}
    # Only overwrite max_hr when we actually have a value — Coros API often omits it
    if row.get("max_hr") is not None:
        update_cols["max_hr"] = stmt.excluded["max_hr"]
    stmt = stmt.on_conflict_do_update(index_elements=["activity_id"], set_=update_cols)
    await session.execute(stmt)


class SyncResult:
    def __init__(self) -> None:
        self.daily_metrics_upserted = 0
        self.sleep_records_upserted = 0
        self.activities_upserted = 0
        self.errors: list[str] = []

    @property
    def status(self) -> str:
        if not self.errors:
            return "success"
        total = self.daily_metrics_upserted + self.sleep_records_upserted + self.activities_upserted
        return "partial" if total else "failed"


async def run_sync(weeks: int | None = None) -> SyncResult:
    weeks = weeks or settings.sync_weeks_lookback
    result = SyncResult()
    profile = await load_profile()
    max_hr = effective_max_hr(profile)

    # coros-mcp list_activities and sync_coros_data expect YYYYMMDD format
    end_day = date.today().strftime("%Y%m%d")
    start_day = (date.today() - timedelta(weeks=weeks)).strftime("%Y%m%d")

    async with coros_client() as client:
        # Populate the coros-mcp local cache for our date window first
        try:
            cache_result = await client.sync_cache(start_day, end_day)
            logger.info("coros-mcp cache synced: %s", cache_result)
        except Exception as exc:
            result.errors.append(f"sync_cache: {exc}")

        try:
            daily_records = await client.get_daily_metrics(weeks=weeks)
        except Exception as exc:
            result.errors.append(f"get_daily_metrics: {exc}")
            daily_records = []

        try:
            sleep_records = await client.get_sleep_data(weeks=weeks)
        except Exception as exc:
            result.errors.append(f"get_sleep_data: {exc}")
            sleep_records = []

        try:
            activity_summaries = await client.list_activities(start_day, end_day)
        except Exception as exc:
            result.errors.append(f"list_activities: {exc}")
            activity_summaries = []

        pairs: list[tuple[ActivitySummaryRecord, ActivityDetailRecord]] = []
        for s in activity_summaries:
            try:
                detail = await client.get_activity_detail(s.activity_id, s.sport_type)
                pairs.append((s, detail))
            except Exception as exc:
                result.errors.append(f"get_activity_detail {s.activity_id}: {exc}")

    async with AsyncSessionLocal() as session:
        async with session.begin():
            result.daily_metrics_upserted = await _upsert_daily_metrics(session, daily_records)
            result.sleep_records_upserted = await _upsert_sleep_records(session, sleep_records)

            lthr_by_date = {r.date: r.lthr for r in daily_records}

            for summary, detail in pairs:
                try:
                    await _upsert_activity(session, summary, detail, lthr_by_date, max_hr)
                    result.activities_upserted += 1
                except Exception as exc:
                    result.errors.append(f"upsert_activity {summary.activity_id}: {exc}")

    for err in result.errors:
        logger.warning("sync error: %s", err)

    return result
