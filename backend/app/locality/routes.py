"""Explicit commute checks backed by Google Routes API route matrices.

One user action compares a future Monday at 09:00 with 14:00 local time and checks
transit at 09:00. Missing routes remain null; this module never estimates them.
"""

from __future__ import annotations

import math
import re
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

import httpx
from timezonefinder import TimezoneFinder

from app.config import get_settings
from app.schemas import CommuteDestination, CommuteReport, CommuteTrip

API = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
FIELD_MASK = "originIndex,destinationIndex,status,condition,distanceMeters,duration,staticDuration"
_TTL_S = 15 * 60
_CACHE: dict[str, tuple[float, CommuteReport]] = {}
_DURATION = re.compile(r"^([0-9]+(?:\.[0-9]+)?)s$")


class RoutesUnavailable(RuntimeError):
    pass


def _key() -> str:
    key = get_settings().google_maps_api_key
    if not key:
        raise RoutesUnavailable("Google Routes is not configured")
    return key


@lru_cache
def _client() -> httpx.Client:
    return httpx.Client(timeout=20)


@lru_cache
def _timezone_finder() -> TimezoneFinder:
    return TimezoneFinder()


def _local_departures(lat: float, lng: float, now: datetime | None = None) -> tuple[str, datetime, datetime]:
    tz_name = _timezone_finder().timezone_at(lat=lat, lng=lng) or "Etc/UTC"
    zone = ZoneInfo(tz_name)
    current = (now or datetime.now(timezone.utc)).astimezone(zone)
    days_ahead = (7 - current.weekday()) % 7 or 7
    monday = (current + timedelta(days=days_ahead)).date()
    peak = datetime(monday.year, monday.month, monday.day, 9, tzinfo=zone)
    offpeak = peak.replace(hour=14)
    return tz_name, peak, offpeak


def _rfc3339(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _post_matrix(
    origin_lat: float,
    origin_lng: float,
    destinations: list[CommuteDestination],
    travel_mode: str,
    departure: datetime,
) -> list[dict]:
    body: dict = {
        "origins": [{"waypoint": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}}}],
        "destinations": [
            {"waypoint": {"location": {"latLng": {"latitude": stop.lat, "longitude": stop.lng}}}}
            for stop in destinations
        ],
        "travelMode": travel_mode,
        "departureTime": _rfc3339(departure),
    }
    if travel_mode == "DRIVE":
        body["routingPreference"] = "TRAFFIC_AWARE_OPTIMAL"

    response = _client().post(
        API,
        json=body,
        headers={"X-Goog-Api-Key": _key(), "X-Goog-FieldMask": FIELD_MASK},
    )
    if response.status_code != 200:
        raise RoutesUnavailable(f"Google Routes could not complete this check ({response.status_code})")
    data = response.json()
    if not isinstance(data, list):
        raise RoutesUnavailable("Google Routes returned an unexpected response")
    return data


def _minutes(value: object) -> int | None:
    if not isinstance(value, str):
        return None
    match = _DURATION.match(value)
    if not match:
        return None
    return max(1, math.ceil(float(match.group(1)) / 60))


def _elements_by_destination(rows: list[dict]) -> dict[int, dict]:
    return {
        row["destinationIndex"]: row
        for row in rows
        if isinstance(row, dict) and isinstance(row.get("destinationIndex"), int)
    }


def _available_minutes(row: dict | None) -> int | None:
    if not row or row.get("condition") != "ROUTE_EXISTS":
        return None
    status = row.get("status") or {}
    if status.get("code") not in (None, 0):
        return None
    return _minutes(row.get("duration"))


def _condition(row: dict | None) -> str | None:
    if not row:
        return None
    status = row.get("status") or {}
    if status.get("code") not in (None, 0):
        return status.get("message") or "ROUTE_ERROR"
    condition = row.get("condition")
    return condition if isinstance(condition, str) else None


def _cache_key(origin_lat: float, origin_lng: float, destinations: list[CommuteDestination]) -> str:
    stops = ";".join(
        f"{stop.kind}:{stop.label}:{stop.lat:.5f}:{stop.lng:.5f}" for stop in destinations
    )
    return f"{origin_lat:.5f}:{origin_lng:.5f}:{stops}"


def get_commute_report(
    origin_lat: float,
    origin_lng: float,
    destinations: list[CommuteDestination],
    *,
    now: datetime | None = None,
) -> CommuteReport:
    key = _cache_key(origin_lat, origin_lng, destinations)
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL_S and now is None:
        return hit[1]

    tz_name, peak, offpeak = _local_departures(origin_lat, origin_lng, now)
    peak_rows = _elements_by_destination(_post_matrix(origin_lat, origin_lng, destinations, "DRIVE", peak))
    offpeak_rows = _elements_by_destination(_post_matrix(origin_lat, origin_lng, destinations, "DRIVE", offpeak))
    transit_rows = _elements_by_destination(_post_matrix(origin_lat, origin_lng, destinations, "TRANSIT", peak))

    trips: list[CommuteTrip] = []
    for index, stop in enumerate(destinations):
        peak_row = peak_rows.get(index)
        offpeak_row = offpeak_rows.get(index)
        transit_row = transit_rows.get(index)
        peak_minutes = _available_minutes(peak_row)
        offpeak_minutes = _available_minutes(offpeak_row)
        transit_minutes = _available_minutes(transit_row)
        distance = peak_row.get("distanceMeters") if peak_row else None
        trips.append(
            CommuteTrip(
                kind=stop.kind,
                label=stop.label,
                lat=stop.lat,
                lng=stop.lng,
                distance_km=round(distance / 1000, 1) if isinstance(distance, (int, float)) else None,
                drive_peak_minutes=peak_minutes,
                drive_offpeak_minutes=offpeak_minutes,
                peak_gap_minutes=(peak_minutes - offpeak_minutes)
                if peak_minutes is not None and offpeak_minutes is not None
                else None,
                transit_minutes=transit_minutes,
                drive_peak_condition=_condition(peak_row),
                drive_offpeak_condition=_condition(offpeak_row),
                transit_condition=_condition(transit_row),
            )
        )

    report = CommuteReport(
        checked_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        timezone=tz_name,
        peak_departure_local=peak.isoformat(),
        offpeak_departure_local=offpeak.isoformat(),
        trips=trips,
    )
    if now is None:
        _CACHE[key] = (time.time(), report)
    return report
