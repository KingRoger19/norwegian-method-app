from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert

from models import AthleteProfile, AsyncSessionLocal

router = APIRouter(prefix="/api/athlete", tags=["athlete"])


class AthleteUpdate(BaseModel):
    date_of_birth: date | None = None
    gender: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    max_hr: int | None = None
    resting_hr: int | None = None
    lt1_hr: int | None = None
    lt2_hr: int | None = None
    lt1_lthr_ratio: float | None = None
    lt1_pace_sec_km: int | None = None
    lt2_pace_sec_km: int | None = None
    ftp_watts: int | None = None
    weekly_zone2_target_mins: int | None = None


def _to_dict(p: AthleteProfile) -> dict[str, Any]:
    return {
        "date_of_birth": p.date_of_birth.isoformat() if p.date_of_birth else None,
        "gender": p.gender,
        "height_cm": p.height_cm,
        "weight_kg": p.weight_kg,
        "max_hr": p.max_hr,
        "resting_hr": p.resting_hr,
        "lt1_hr": p.lt1_hr,
        "lt2_hr": p.lt2_hr,
        "lt1_lthr_ratio": p.lt1_lthr_ratio,
        "lt1_pace_sec_km": p.lt1_pace_sec_km,
        "lt2_pace_sec_km": p.lt2_pace_sec_km,
        "ftp_watts": p.ftp_watts,
        "weekly_zone2_target_mins": p.weekly_zone2_target_mins,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
async def get_athlete() -> dict[str, Any]:
    async with AsyncSessionLocal() as session:
        profile = await session.get(AthleteProfile, 1)
    return _to_dict(profile) if profile else {}


@router.put("")
async def upsert_athlete(body: AthleteUpdate) -> dict[str, Any]:
    updates = body.model_dump(exclude_unset=True)
    updates["updated_at"] = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        async with session.begin():
            stmt = insert(AthleteProfile).values(id=1, **updates)
            stmt = stmt.on_conflict_do_update(
                index_elements=["id"],
                set_=updates,
            )
            await session.execute(stmt)
        profile = await session.get(AthleteProfile, 1)

    return _to_dict(profile)  # type: ignore[arg-type]
