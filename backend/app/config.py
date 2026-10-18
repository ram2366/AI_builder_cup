from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every value can be overridden with an env var of the same name."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "mock" serves the illustrative evidence pack; "earthengine" runs the real tools.
    evidence_provider: str = "mock"
    mock_delay_s: float = 0.6
    # "memory" for local dev; "firestore" on Cloud Run so every instance sees the same reports.
    store: str = "memory"

    gcp_project: str = ""
    # Google Places API (New), server-side. Search box + locality amenities.
    google_maps_api_key: str = ""
    gcp_location: str = "global"
    # AI Studio key (local dev). On Cloud Run we use Vertex AI / Agent Platform with the service account.
    gemini_api_key: str = ""
    use_vertex: bool = False
    gemini_model: str = "gemini-3.8-flash"
    # Tried in order when the primary model is overloaded (503) or rate-limited (429).
    gemini_fallback_models: list[str] = ["gemini-3.6-flash", "gemini-3.5-flash"]
    # The agent runs whenever Gemini credentials exist; set USE_AGENT=false to force template findings.
    use_agent: bool = True
    agent_timeout_s: float = 45
    agent_max_tool_calls: int = 4

    pipeline_version: str = "0.1.0"
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
