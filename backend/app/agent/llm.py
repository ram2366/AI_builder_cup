"""Thin wrapper over the Google Gen AI SDK: one client, structured JSON calls, credential checks."""

import logging
import os
import time
from collections.abc import Callable
from functools import lru_cache
from typing import TypeVar

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import get_settings

T = TypeVar("T", bound=BaseModel)
R = TypeVar("R")
log = logging.getLogger(__name__)

# Short, bounded retries on overload; then we move to the next model instead of waiting longer.
_RETRY = types.HttpOptions(
    timeout=25_000,  # ms per request
    retry_options=types.HttpRetryOptions(
        attempts=2, initial_delay=1.0, max_delay=3.0, http_status_codes=[429, 500, 503, 504]
    ),
)


def agent_enabled() -> bool:
    s = get_settings()
    return s.use_agent and (s.use_vertex or bool(s.gemini_api_key or os.environ.get("GEMINI_API_KEY")))


@lru_cache
def get_client() -> genai.Client:
    s = get_settings()
    if s.use_vertex:
        os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", s.gcp_project)
        os.environ.setdefault("GOOGLE_CLOUD_LOCATION", s.gcp_location)
        return genai.Client(
            vertexai=True, project=s.gcp_project, location=s.gcp_location, http_options=_RETRY
        )
    key = s.gemini_api_key or os.environ.get("GEMINI_API_KEY", "")
    # ADK builds its own client from the environment, so expose the key there too.
    os.environ.setdefault("GOOGLE_API_KEY", key)
    return genai.Client(api_key=key, http_options=_RETRY)


def model_name() -> str:
    return get_settings().gemini_model


def models() -> list[str]:
    s = get_settings()
    return [s.gemini_model, *[m for m in s.gemini_fallback_models if m != s.gemini_model]]


# Circuit breaker: a model that just returned "overloaded" is skipped for a while, so one busy
# model doesn't add retry delays to every later step of the same report.
_COOLDOWN_S = 60.0
_down_until: dict[str, float] = {}


class ModelsUnavailable(RuntimeError):
    pass


def with_fallback(call: Callable[[str], R]) -> R:
    """Run call(model) on the first healthy model, moving on only on overload / quota errors."""
    now = time.monotonic()
    candidates = [m for m in models() if _down_until.get(m, 0) <= now]
    if not candidates:
        raise ModelsUnavailable("all Gemini models are cooling down after overload errors")
    last: Exception | None = None
    for m in candidates:
        try:
            result = call(m)
            _down_until.pop(m, None)
            return result
        except errors.APIError as e:
            if e.code not in (429, 500, 503, 504):
                raise
            log.warning("model %s unavailable (%s); trying next", m, e.code)
            _down_until[m] = time.monotonic() + _COOLDOWN_S
            last = e
    assert last is not None
    raise last


def image_part(data: bytes, mime: str = "image/png") -> types.Part:
    return types.Part.from_bytes(data=data, mime_type=mime)


def generate_json(
    schema: type[T],
    contents: list,
    system: str,
    temperature: float = 0.2,
) -> T:
    """One structured-output call. Raises on empty or invalid output so callers can fall back."""
    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
        response_schema=schema,
        thinking_config=types.ThinkingConfig(thinking_level="low"),
    )
    resp = with_fallback(
        lambda m: get_client().models.generate_content(model=m, contents=contents, config=config)
    )
    if isinstance(resp.parsed, schema):
        return resp.parsed
    if resp.text:
        return schema.model_validate_json(resp.text)
    raise ValueError("Gemini returned no structured output")
