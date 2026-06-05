import asyncio
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.services.fit_importer import ImportResult, run_fit_import

router = APIRouter(prefix="/api/import/fit", tags=["import"])


class FitImportStatus(BaseModel):
    status: Literal["idle", "running", "success", "partial", "failed"]
    fit_dir: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    total_files: int = 0
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[str] = []


_state = FitImportStatus(status="idle")
_lock = asyncio.Lock()


async def _run_and_update(fit_dir: str) -> None:
    global _state  # noqa: PLW0603
    started_at = _state.started_at
    try:
        result: ImportResult = await run_fit_import(fit_dir)
        _state = FitImportStatus(
            status=result.status,  # type: ignore[arg-type]
            fit_dir=fit_dir,
            started_at=started_at,
            completed_at=datetime.utcnow(),
            total_files=result.total_files,
            imported=result.imported,
            updated=result.updated,
            skipped=result.skipped,
            errors=result.errors[:50],  # cap to avoid huge responses
        )
    except Exception as exc:
        _state = FitImportStatus(
            status="failed",
            fit_dir=fit_dir,
            started_at=started_at,
            completed_at=datetime.utcnow(),
            errors=[str(exc)],
        )


@router.post("/trigger", response_model=FitImportStatus, summary="Import all .fit files from a directory")
async def trigger_fit_import(
    background_tasks: BackgroundTasks,
    fit_dir: str,
) -> FitImportStatus:
    """
    Kick off a background import of every .fit file under `fit_dir`.
    Returns immediately with status=running; poll GET /api/import/fit/status for progress.
    Responds 409 if an import is already running.
    """
    global _state  # noqa: PLW0603
    async with _lock:
        if _state.status == "running":
            raise HTTPException(status_code=409, detail="Import already in progress")
        _state = FitImportStatus(
            status="running",
            fit_dir=fit_dir,
            started_at=datetime.utcnow(),
        )

    background_tasks.add_task(_run_and_update, fit_dir)
    return _state


@router.get("/status", response_model=FitImportStatus, summary="Last .fit import status")
async def fit_import_status() -> FitImportStatus:
    return _state
