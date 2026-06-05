import asyncio
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.services.ingestion import SyncResult, run_sync

router = APIRouter(prefix="/api/sync", tags=["sync"])


class SyncStatus(BaseModel):
    status: Literal["idle", "running", "success", "partial", "failed"]
    started_at: datetime | None = None
    completed_at: datetime | None = None
    daily_metrics_upserted: int = 0
    sleep_records_upserted: int = 0
    activities_upserted: int = 0
    errors: list[str] = []


_state = SyncStatus(status="idle")
_lock = asyncio.Lock()


async def _run_and_update(weeks: int) -> None:
    global _state  # noqa: PLW0603
    started_at = _state.started_at
    try:
        result: SyncResult = await run_sync(weeks)
        _state = SyncStatus(
            status=result.status,  # type: ignore[arg-type]
            started_at=started_at,
            completed_at=datetime.utcnow(),
            daily_metrics_upserted=result.daily_metrics_upserted,
            sleep_records_upserted=result.sleep_records_upserted,
            activities_upserted=result.activities_upserted,
            errors=result.errors,
        )
    except Exception as exc:
        _state = SyncStatus(
            status="failed",
            started_at=started_at,
            completed_at=datetime.utcnow(),
            errors=[str(exc)],
        )


@router.post("/trigger", response_model=SyncStatus, summary="Trigger a manual Coros data sync")
async def trigger_sync(
    background_tasks: BackgroundTasks,
    weeks: int = 1,
) -> SyncStatus:
    """
    Kicks off a background sync pulling the last `weeks` weeks from Coros.
    Returns immediately with status=running; poll GET /api/sync/status for the result.
    Responds 409 if a sync is already in progress.
    """
    global _state  # noqa: PLW0603
    async with _lock:
        if _state.status == "running":
            raise HTTPException(status_code=409, detail="Sync already in progress")
        _state = SyncStatus(status="running", started_at=datetime.utcnow())

    background_tasks.add_task(_run_and_update, weeks)
    return _state


@router.get("/status", response_model=SyncStatus, summary="Last sync result")
async def sync_status() -> SyncStatus:
    return _state
