"""Helpers for loading the athlete profile and resolving effective calculation values."""

from models import AthleteProfile, AsyncSessionLocal
from app.config import settings


async def load_profile() -> AthleteProfile | None:
    async with AsyncSessionLocal() as session:
        return await session.get(AthleteProfile, 1)


def effective_max_hr(profile: AthleteProfile | None) -> int | None:
    """Max HR for pct_of_hr_max. Profile takes priority; falls back to .env."""
    if profile and profile.max_hr:
        return profile.max_hr
    return settings.user_max_hr or None


def effective_lt1_ratio(profile: AthleteProfile | None) -> float:
    """Ratio used to derive LT1 from LT2 when LT1 is not directly measured."""
    if profile and profile.lt1_lthr_ratio:
        return profile.lt1_lthr_ratio
    return settings.lt1_lthr_ratio


def effective_lt2_hr(profile: AthleteProfile | None, date_lthr: int | None) -> int | None:
    """
    Resolve LTHR for a given activity date.
    Priority: per-date LTHR from daily_metrics → profile baseline lt2_hr.
    """
    return date_lthr or (profile.lt2_hr if profile else None)


def effective_lt1_hr(profile: AthleteProfile | None, lthr: int | None) -> int | None:
    """
    Resolve LT1 HR for zone calculation.
    Priority: directly measured lt1_hr from profile → lthr × lt1_lthr_ratio.
    """
    if profile and profile.lt1_hr:
        return profile.lt1_hr
    if lthr:
        return int(lthr * effective_lt1_ratio(profile))
    return None
