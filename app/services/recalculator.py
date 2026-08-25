import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select, update

from app.services.athlete import effective_lt1_ratio, effective_max_hr, load_profile
from app.services.fit_importer import _compute_zones
from models import ActivitySummary, ActivityTimeSeries, AsyncSessionLocal, DailyMetrics

logger = logging.getLogger(__name__)

BATCH_SIZE = 100


@dataclass
class RecalcResult:
    total: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        if not self.errors:
            return "success"
        if self.updated:
            return "partial"
        return "failed"


async def run_recalculate() -> RecalcResult:
    result = RecalcResult()

    profile = await load_profile()
    user_max_hr = effective_max_hr(profile)
    lt1_ratio = effective_lt1_ratio(profile)
    profile_lt2_hr = profile.lt2_hr if profile else None

    if not profile_lt2_hr:
        result.errors.append("LT2 HR not set in Athlete Profile — set it first, then recalculate.")
        return result

    # Per-date LTHR from Coros sync takes priority over profile baseline
    async with AsyncSessionLocal() as session:
        lthr_rows = (await session.execute(
            select(DailyMetrics.date, DailyMetrics.lactate_threshold_hr)
        )).all()
    lthr_by_date: dict[date, int | None] = {r[0]: r[1] for r in lthr_rows}

    # All activities that have a stored HR stream
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(
                ActivityTimeSeries.activity_id,
                ActivityTimeSeries.stream_data,
                ActivitySummary.avg_hr,
                ActivitySummary.date,
            ).join(ActivitySummary, ActivitySummary.activity_id == ActivityTimeSeries.activity_id)
        )).all()

    result.total = len(rows)

    for batch_start in range(0, len(rows), BATCH_SIZE):
        batch = rows[batch_start: batch_start + BATCH_SIZE]
        updates: list[dict] = []

        for row in batch:
            activity_id, stream_data, avg_hr, activity_date = row
            try:
                hr_series = (stream_data or {}).get("heart_rate", [])
                lthr = lthr_by_date.get(activity_date) or profile_lt2_hr
                z1, z2, z3 = _compute_zones(hr_series, lthr, lt1_ratio)
                pct = round(avg_hr / user_max_hr * 100, 2) if avg_hr and user_max_hr else None
                updates.append({
                    "activity_id": activity_id,
                    "zone1_secs": z1,
                    "zone2_secs": z2,
                    "zone3_secs": z3,
                    "pct_of_hr_max": pct,
                })
            except Exception as exc:
                result.skipped += 1
                result.errors.append(f"{activity_id}: {exc}")

        if not updates:
            continue

        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    for u in updates:
                        await session.execute(
                            update(ActivitySummary)
                            .where(ActivitySummary.activity_id == u["activity_id"])
                            .values(
                                zone1_secs=u["zone1_secs"],
                                zone2_secs=u["zone2_secs"],
                                zone3_secs=u["zone3_secs"],
                                pct_of_hr_max=u["pct_of_hr_max"],
                            )
                        )
            result.updated += len(updates)
        except Exception as exc:
            msg = f"DB error batch {batch_start}: {exc}"
            logger.error(msg)
            result.errors.append(msg)
            result.skipped += len(updates)

        logger.info(
            "recalculate %d/%d — updated=%d skipped=%d",
            batch_start + len(batch), result.total, result.updated, result.skipped,
        )

    return result
