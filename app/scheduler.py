import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.services.ingestion import run_sync

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=settings.sync_timezone)


async def _daily_sync_job() -> None:
    logger.info("Scheduled daily Coros sync starting")
    result = await run_sync()
    logger.info(
        "Sync done — status=%s daily=%d sleep=%d activities=%d errors=%d",
        result.status,
        result.daily_metrics_upserted,
        result.sleep_records_upserted,
        result.activities_upserted,
        len(result.errors),
    )


def setup_scheduler() -> None:
    scheduler.add_job(
        _daily_sync_job,
        trigger=CronTrigger(hour=settings.sync_hour, minute=0),
        id="daily_coros_sync",
        replace_existing=True,
        misfire_grace_time=3600,
    )
