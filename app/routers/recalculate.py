import asyncio
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.services.recalculator import RecalcResult, run_recalculate

router = APIRouter(prefix="/api/recalculate", tags=["recalculate"])


class RecalcStatus(BaseModel):
    status: Literal["idle", "running", "success", "partial", "failed"]
    started_at: datetime | None = None
    completed_at: datetime | None = None
    total: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = []


_state = RecalcStatus(status="idle")
_lock = asyncio.Lock()


async def _run_and_update() -> None:
    global _state  # noqa: PLW0603
    started_at = _state.started_at
    try:
        result: RecalcResult = await run_recalculate()
        _state = RecalcStatus(
            status=result.status,  # type: ignore[arg-type]
            started_at=started_at,
            completed_at=datetime.utcnow(),
            total=result.total,
            updated=result.updated,
            skipped=result.skipped,
            errors=result.errors[:50],
        )
    except Exception as exc:
        _state = RecalcStatus(
            status="failed",
            started_at=started_at,
            completed_at=datetime.utcnow(),
            errors=[str(exc)],
        )


@router.post("/trigger", response_model=RecalcStatus, summary="Recalculate zones and HR% from stored streams")
async def trigger_recalculate(background_tasks: BackgroundTasks) -> RecalcStatus:
    """
    Re-derives zone1_secs / zone2_secs / zone3_secs / pct_of_hr_max for every
    activity that has a stored HR stream, using the current Athlete Profile thresholds.
    No .fit files needed. Returns immediately; poll GET /api/recalculate/status.
    """
    global _state  # noqa: PLW0603
    async with _lock:
        if _state.status == "running":
            raise HTTPException(status_code=409, detail="Recalculation already in progress")
        _state = RecalcStatus(status="running", started_at=datetime.utcnow())
    background_tasks.add_task(_run_and_update)
    return _state


@router.get("/status", response_model=RecalcStatus, summary="Last recalculation status")
async def recalculate_status() -> RecalcStatus:
    return _state
