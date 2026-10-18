"""Explicit, unscored urban air-quality evidence for Locality Lens."""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import httpx
from timezonefinder import TimezoneFinder

from app.config import get_settings
from app.schemas import AirHistoryDay, AirIndex, AirNo2History, AirPollutant, AirQualityReport

API = "https://airquality.googleapis.com/v1"
_TTL_S = 60 * 60
_CACHE: dict[str, tuple[float, AirQualityReport]] = {}
_TILE_CACHE: dict[str, tuple[float, bytes]] = {}


class AirQualityUnavailable(RuntimeError):
    pass


def _key() -> str:
    key = get_settings().google_maps_api_key
    if not key:
        raise AirQualityUnavailable("Google Air Quality is not configured")
    return key


@lru_cache
def _client() -> httpx.Client:
    return httpx.Client(timeout=25)


@lru_cache
def _timezone_finder() -> TimezoneFinder:
    return TimezoneFinder()


def _post(path: str, body: dict) -> dict:
    response = _client().post(f"{API}/{path}", params={"key": _key()}, json=body)
    if response.status_code != 200:
        raise AirQualityUnavailable(f"Google Air Quality could not complete this check ({response.status_code})")
    data = response.json()
    if not isinstance(data, dict):
        raise AirQualityUnavailable("Google Air Quality returned an unexpected response")
    return data


def _choose_index(indexes: list[dict], preferred: str | None = None) -> dict | None:
    if preferred:
        match = next((index for index in indexes if index.get("code") == preferred), None)
        if match:
            return match
    for code in ("ind_cpcb",):
        match = next((index for index in indexes if index.get("code") == code), None)
        if match:
            return match
    return next((index for index in indexes if index.get("code") != "uaqi"), None) or next(
        (index for index in indexes if index.get("code") == "uaqi"), None
    )


def _index(raw: dict) -> AirIndex:
    numeric = raw.get("aqi")
    return AirIndex(
        code=str(raw.get("code", "")),
        display_name=str(raw.get("displayName", "Air quality index")),
        aqi=int(numeric) if isinstance(numeric, (int, float)) else None,
        aqi_display=str(raw.get("aqiDisplay", numeric if numeric is not None else "Unavailable")),
        category=str(raw.get("category", "Category unavailable")),
        dominant_pollutant=raw.get("dominantPollutant"),
    )


def _pollutants(rows: list[dict]) -> list[AirPollutant]:
    shaped: list[AirPollutant] = []
    for row in rows:
        concentration = row.get("concentration") or {}
        value = concentration.get("value")
        if not isinstance(value, (int, float)):
            continue
        shaped.append(
            AirPollutant(
                code=str(row.get("code", "")),
                display_name=str(row.get("displayName", row.get("code", ""))),
                full_name=str(row.get("fullName", row.get("displayName", row.get("code", "")))),
                concentration=round(float(value), 2),
                units=str(concentration.get("units", "")),
            )
        )
    return shaped


def _history(lat: float, lng: float) -> list[dict]:
    base = {
        "location": {"latitude": lat, "longitude": lng},
        "hours": 720,
        "pageSize": 168,
        "extraComputations": ["LOCAL_AQI"],
        "universalAqi": True,
        "languageCode": "en",
    }
    rows: list[dict] = []
    token = ""
    for _ in range(5):
        page = _post("history:lookup", {**base, "pageToken": token})
        rows.extend(row for row in page.get("hoursInfo", []) if isinstance(row, dict))
        token = str(page.get("nextPageToken", ""))
        if not token:
            break
    return rows


def shape_history(rows: list[dict], index_code: str, timezone_name: str) -> list[AirHistoryDay]:
    zone = ZoneInfo(timezone_name)
    days: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        raw_index = _choose_index(row.get("indexes", []), index_code)
        value = raw_index.get("aqi") if raw_index else None
        timestamp = row.get("dateTime")
        if not isinstance(value, (int, float)) or not isinstance(timestamp, str):
            continue
        local_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(zone).date().isoformat()
        days[local_date].append(int(value))
    shaped = [
        AirHistoryDay(date=date, aqi_mean=round(sum(values) / len(values), 1), aqi_max=max(values), hours=len(values))
        for date, values in sorted(days.items())
    ]
    return shaped[-30:]


def get_air_quality_report(lat: float, lng: float) -> AirQualityReport:
    cache_key = f"{lat:.4f}:{lng:.4f}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL_S:
        return hit[1]

    timezone_name = _timezone_finder().timezone_at(lat=lat, lng=lng) or "Etc/UTC"
    current = _post(
        "currentConditions:lookup",
        {
            "location": {"latitude": lat, "longitude": lng},
            "extraComputations": ["LOCAL_AQI", "POLLUTANT_CONCENTRATION"],
            "universalAqi": True,
            "languageCode": "en",
        },
    )
    selected = _choose_index(current.get("indexes", []))
    if not selected:
        raise AirQualityUnavailable("No air-quality index is available for this location")

    unavailable: list[str] = []
    try:
        history = shape_history(_history(lat, lng), str(selected.get("code", "")), timezone_name)
    except AirQualityUnavailable:
        history = []
        unavailable.append("30-day Google Air Quality history")

    try:
        from app.tools.earthengine import air_no2_context

        raw_no2 = air_no2_context(lat, lng)
        no2 = AirNo2History.model_validate(raw_no2) if raw_no2.get("by_year") else None
        if no2 is None:
            unavailable.append("Sentinel-5P annual NO₂ context")
    except Exception:
        no2 = None
        unavailable.append("Sentinel-5P annual NO₂ context")

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    report = AirQualityReport(
        checked_at=now,
        current_at=str(current.get("dateTime", now)),
        timezone=timezone_name,
        region_code=current.get("regionCode"),
        index=_index(selected),
        pollutants=_pollutants(current.get("pollutants", [])),
        history_period=f"{history[0].date} to {history[-1].date}" if history else "Unavailable",
        history_daily=history,
        no2=no2,
        unavailable=unavailable,
    )
    _CACHE[cache_key] = (time.time(), report)
    return report


def get_heatmap_tile(zoom: int, x: int, y: int) -> bytes:
    if not 0 <= zoom <= 16 or not 0 <= x < 2**zoom or not 0 <= y < 2**zoom:
        raise AirQualityUnavailable("Invalid air-quality tile coordinates")
    key = f"{zoom}:{x}:{y}"
    hit = _TILE_CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL_S:
        return hit[1]
    response = _client().get(
        f"{API}/mapTypes/UAQI_INDIGO_PERSIAN/heatmapTiles/{zoom}/{x}/{y}", params={"key": _key()}
    )
    if response.status_code != 200 or not response.content:
        raise AirQualityUnavailable(f"Air-quality heatmap tile is unavailable ({response.status_code})")
    if len(_TILE_CACHE) >= 256:
        _TILE_CACHE.clear()
    _TILE_CACHE[key] = (time.time(), response.content)
    return response.content
