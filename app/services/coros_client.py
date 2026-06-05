import json
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from app.config import settings


def _iso_date(s: str) -> str:
    """Normalise coros-mcp date strings to YYYY-MM-DD.
    coros-mcp returns dates as 'YYYYMMDD'; ISO strings pass through unchanged.
    """
    s = str(s)
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    return s


@dataclass
class DailyMetricRecord:
    date: str
    avg_sleep_hrv: float | None
    hrv_baseline: float | None
    rhr: int | None
    training_load: int | None
    training_load_ratio: float | None
    tired_rate: float | None
    vo2max: int | None
    lthr: int | None


@dataclass
class CorosSleepRecord:
    date: str
    total_duration_minutes: int
    deep_minutes: int | None
    rem_minutes: int | None
    quality_score: int | None


@dataclass
class ActivitySummaryRecord:
    activity_id: str
    date: str
    start_time: str
    duration_seconds: int
    distance_meters: float
    sport_type: int
    avg_hr: int | None = None
    max_hr: int | None = None
    avg_power: int | None = None
    normalized_power: int | None = None
    elevation_gain: float | None = None


@dataclass
class ActivityDetailRecord:
    activity_id: str
    avg_cadence: float | None = None
    ground_time: float | None = None
    stride_height: float | None = None
    stride_ratio: float | None = None
    avg_stride_length: float | None = None
    vertical_speed: float | None = None
    # Raw Coros HR zone list: [{zone_number: int, seconds: int}, ...]
    hr_zones: list[dict] | None = None


class CorosClient:
    def __init__(self, session: ClientSession) -> None:
        self._session = session

    async def _call(self, tool: str, params: dict) -> Any:
        result = await self._session.call_tool(tool, params)
        if not result.content:
            return {}
        return json.loads(result.content[0].text)

    async def get_daily_metrics(self, weeks: int = 1) -> list[DailyMetricRecord]:
        data = await self._call("get_daily_metrics", {"weeks": weeks})
        return [
            DailyMetricRecord(
                date=_iso_date(r["date"]),
                avg_sleep_hrv=r.get("avg_sleep_hrv"),
                hrv_baseline=r.get("baseline"),
                rhr=r.get("rhr"),
                training_load=r.get("training_load"),
                training_load_ratio=r.get("training_load_ratio"),
                tired_rate=r.get("tired_rate"),
                vo2max=r.get("vo2max"),
                lthr=r.get("lthr"),
            )
            for r in data.get("records", [])
        ]

    async def get_sleep_data(self, weeks: int = 1) -> list[CorosSleepRecord]:
        data = await self._call("get_sleep_data", {"weeks": weeks})
        records = []
        for r in data.get("records", []):
            phases = r.get("phases") or {}
            records.append(CorosSleepRecord(
                date=_iso_date(r["date"]),
                total_duration_minutes=r.get("total_duration_minutes", 0),
                deep_minutes=phases.get("deep_minutes"),
                rem_minutes=phases.get("rem_minutes"),
                quality_score=r.get("quality_score"),
            ))
        return records

    async def list_activities(self, start_day: str, end_day: str) -> list[ActivitySummaryRecord]:
        data = await self._call("list_activities", {
            "start_day": start_day,
            "end_day": end_day,
            "page": 1,
            "size": 100,
        })
        records = []
        for a in data.get("activities", []):
            start_time = a.get("start_time", "")
            # start_time is 'YYYY-MM-DD HH:MM:SS'; take the date part directly
            iso_date = start_time[:10] if start_time else ""
            records.append(ActivitySummaryRecord(
                activity_id=str(a["activity_id"]),
                date=iso_date,
                start_time=start_time,
                duration_seconds=a.get("duration_seconds", 0),
                distance_meters=float(a.get("distance_meters", 0)),
                sport_type=int(a.get("sport_type", 0)),
                avg_hr=a.get("avg_hr"),
                max_hr=a.get("max_hr"),
                avg_power=a.get("avg_power"),
                normalized_power=a.get("normalized_power"),
                elevation_gain=a.get("elevation_gain"),
            ))
        return records

    async def sync_cache(self, start_day: str, end_day: str) -> dict:
        """Sync Coros API data into the coros-mcp local cache for the given range."""
        return await self._call("sync_coros_data", {"start_day": start_day, "end_day": end_day})

    async def get_activity_detail(self, activity_id: str, sport_type: int) -> ActivityDetailRecord:
        data = await self._call("get_activity_detail", {
            "activity_id": activity_id,
            "sport_type": sport_type,
        })
        # Coros may use different field names; try common variants
        hr_zones = (
            data.get("hr_zones")
            or data.get("heart_rate_zones")
            or data.get("hrZones")
        )
        return ActivityDetailRecord(
            activity_id=activity_id,
            avg_cadence=data.get("avg_cadence") or data.get("avgCadence"),
            ground_time=data.get("ground_time") or data.get("stance_time") or data.get("groundTime"),
            stride_height=data.get("stride_height") or data.get("vertical_oscillation") or data.get("verticalOscillation"),
            stride_ratio=data.get("stride_ratio") or data.get("vertical_ratio") or data.get("verticalRatio"),
            avg_stride_length=data.get("avg_stride_length") or data.get("step_length") or data.get("stepLength"),
            vertical_speed=data.get("vertical_speed") or data.get("verticalSpeed"),
            hr_zones=hr_zones,
        )


@asynccontextmanager
async def coros_client():
    """Spawns the Coros MCP subprocess and yields an authenticated client."""
    params = StdioServerParameters(
        command=settings.coros_mcp_command,
        args=["serve"],
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield CorosClient(session)
