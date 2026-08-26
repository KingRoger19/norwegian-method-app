import os
from datetime import date, datetime
from typing import Optional
from sqlalchemy import CheckConstraint

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.ext.asyncio import AsyncAttrs, AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/norwegian_method",
)

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal: sessionmaker[AsyncSession] = sessionmaker(  # type: ignore[assignment]
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(AsyncAttrs, DeclarativeBase):
    pass


class DailyMetrics(Base):
    __tablename__ = "daily_metrics"

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    resting_heart_rate: Mapped[Optional[int]] = mapped_column(Integer)
    hrv_baseline: Mapped[Optional[float]] = mapped_column(Float)
    hrv_today: Mapped[Optional[float]] = mapped_column(Float)
    training_load: Mapped[Optional[int]] = mapped_column(Integer)
    training_load_ratio: Mapped[Optional[float]] = mapped_column(Float)
    tired_rate: Mapped[Optional[float]] = mapped_column(Float)
    vo2max: Mapped[Optional[int]] = mapped_column(Integer)
    lactate_threshold_hr: Mapped[Optional[int]] = mapped_column(Integer)

    sleep: Mapped[Optional["SleepRecord"]] = relationship(back_populates="daily_metrics")
    activities: Mapped[list["ActivitySummary"]] = relationship(back_populates="daily_metrics")


class SleepRecord(Base):
    __tablename__ = "sleep_records"

    date: Mapped[date] = mapped_column(Date, ForeignKey("daily_metrics.date"), primary_key=True)
    total_duration_mins: Mapped[int] = mapped_column(Integer, nullable=False)
    deep_mins: Mapped[Optional[int]] = mapped_column(Integer)
    rem_mins: Mapped[Optional[int]] = mapped_column(Integer)
    quality_score: Mapped[Optional[int]] = mapped_column(Integer)

    daily_metrics: Mapped["DailyMetrics"] = relationship(back_populates="sleep")


class ActivitySummary(Base):
    __tablename__ = "activity_summaries"

    activity_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    date: Mapped[date] = mapped_column(Date, ForeignKey("daily_metrics.date"), index=True)
    start_time: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_meters: Mapped[float] = mapped_column(Float, nullable=False)
    avg_hr: Mapped[Optional[int]] = mapped_column(Integer)
    max_hr: Mapped[Optional[int]] = mapped_column(Integer)
    pct_of_hr_max: Mapped[Optional[float]] = mapped_column(Float)
    avg_power: Mapped[Optional[int]] = mapped_column(Integer)
    normalized_power: Mapped[Optional[int]] = mapped_column(Integer)
    avg_cadence: Mapped[Optional[float]] = mapped_column(Float)
    avg_stride_length: Mapped[Optional[float]] = mapped_column(Float)
    ground_time: Mapped[Optional[float]] = mapped_column(Float)
    stride_height: Mapped[Optional[float]] = mapped_column(Float)
    stride_ratio: Mapped[Optional[float]] = mapped_column(Float)
    total_ascent: Mapped[Optional[float]] = mapped_column(Float)
    total_descent: Mapped[Optional[float]] = mapped_column(Float)
    vertical_speed: Mapped[Optional[float]] = mapped_column(Float)
    zone1_secs: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    zone2_secs: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    zone3_secs: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    lactate_1_mmol: Mapped[Optional[float]] = mapped_column(Float)
    lactate_1_notes: Mapped[Optional[str]] = mapped_column(String)
    lactate_2_mmol: Mapped[Optional[float]] = mapped_column(Float)
    lactate_2_notes: Mapped[Optional[str]] = mapped_column(String)
    lactate_3_mmol: Mapped[Optional[float]] = mapped_column(Float)
    lactate_3_notes: Mapped[Optional[str]] = mapped_column(String)
    lactate_4_mmol: Mapped[Optional[float]] = mapped_column(Float)
    lactate_4_notes: Mapped[Optional[str]] = mapped_column(String)
    lactate_5_mmol: Mapped[Optional[float]] = mapped_column(Float)
    lactate_5_notes: Mapped[Optional[str]] = mapped_column(String)

    daily_metrics: Mapped["DailyMetrics"] = relationship(back_populates="activities")
    time_series: Mapped[Optional["ActivityTimeSeries"]] = relationship(back_populates="activity")


class ActivityTimeSeries(Base):
    __tablename__ = "activity_time_series"

    activity_id: Mapped[str] = mapped_column(
        String(50), ForeignKey("activity_summaries.activity_id"), primary_key=True
    )
    # { "timestamps": [...], "heart_rate": [...], "power": [...],
    #   "speed": [...], "effort_pace": [...], "lat_long": [[lat, lon], ...] }
    stream_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    activity: Mapped["ActivitySummary"] = relationship(back_populates="time_series")


class AthleteProfile(Base):
    """Single-row athlete configuration table (id always = 1)."""
    __tablename__ = "athlete_profile"
    __table_args__ = (CheckConstraint("id = 1", name="ck_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    gender: Mapped[Optional[str]] = mapped_column(String(1))
    height_cm: Mapped[Optional[float]] = mapped_column(Float)
    weight_kg: Mapped[Optional[float]] = mapped_column(Float)
    max_hr: Mapped[Optional[int]] = mapped_column(Integer)
    resting_hr: Mapped[Optional[int]] = mapped_column(Integer)
    # Lactate thresholds — HR
    lt1_hr: Mapped[Optional[int]] = mapped_column(Integer)
    lt2_hr: Mapped[Optional[int]] = mapped_column(Integer)
    lt1_lthr_ratio: Mapped[Optional[float]] = mapped_column(Float, server_default=text("0.88"))
    # Lactate thresholds — pace (seconds / km)
    lt1_pace_sec_km: Mapped[Optional[int]] = mapped_column(Integer)
    lt2_pace_sec_km: Mapped[Optional[int]] = mapped_column(Integer)
    # Power
    ftp_watts: Mapped[Optional[int]] = mapped_column(Integer)
    # Training targets
    weekly_zone2_target_mins: Mapped[Optional[int]] = mapped_column(Integer, server_default=text("90"))
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )


class WikiComment(Base):
    __tablename__ = "wiki_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("wiki_comments.id", ondelete="CASCADE"))
    author: Mapped[str] = mapped_column(String(50), nullable=False)
    body: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP, server_default=text("NOW()"))


async def create_all_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_all_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
