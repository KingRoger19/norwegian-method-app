from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    # Path to the coros-mcp executable; override if installed in a different venv
    coros_mcp_command: str = "coros-mcp"

    # Scheduler: daily sync fires at sync_hour:00 in sync_timezone
    sync_timezone: str = "Europe/Rome"
    sync_hour: int = 9

    # How many weeks back to pull on each sync
    sync_weeks_lookback: int = 1

    # Used for pct_of_hr_max calculation in activity_summaries
    user_max_hr: int = 185

    # LT1 is approximated as this fraction of LTHR (LT2) until .fit data is available
    lt1_lthr_ratio: float = 0.88

    # Dashboard authentication (local gate only)
    coros_email: str = ""
    coros_password: str = ""

    # Additional users — username:password pairs (coach, guest, etc.)
    coach_username: str = ""
    coach_password: str = ""


settings = Settings()
