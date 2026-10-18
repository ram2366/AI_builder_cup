"""Safer alternatives nearby: scan a ring of candidate points around a plot with a cheap subset of
the evidence, rate each with the same rules, and return the best few lower-risk spots."""

import math

from app.rules import overall_level, rate_all
from app.schemas import LEVEL_ORDER, Alternative, AlternativesResponse, Evidence, Report
from app.tools.provider import get_provider

RINGS_KM = (1.0, 2.0, 3.0)
BEARINGS = 8
COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _offset(lat: float, lng: float, km: float, bearing_deg: float) -> tuple[float, float]:
    b = math.radians(bearing_deg)
    dlat = km * math.cos(b) / 111.32
    dlng = km * math.sin(b) / (111.32 * math.cos(math.radians(lat)))
    return lat + dlat, lng + dlng


def _highlights(ev: Evidence) -> list[str]:
    out = []
    if ev.jrc is not None and ev.jrc.occurrence_core_pct < 1:
        out.append(f"No surface water recorded {ev.jrc.period}")
    if ev.monsoon is not None:
        out.append(
            "No wet-season water seen" if not ev.monsoon.seen
            else f"Wet-season water in {len(ev.monsoon.seen)} of {ev.monsoon.observed_years} years"
        )
    if ev.terrain is not None:
        out.append(f"{ev.terrain.hand_m:.1f} m above nearest drainage")
    return out[:3]


def find(report: Report, limit: int = 3) -> AlternativesResponse:
    provider = get_provider()
    origin = overall_level(report.ratings)
    candidates: list[Alternative] = []
    scanned = 0
    for km in RINGS_KM:
        for i in range(BEARINGS):
            bearing = i * 360 / BEARINGS + (km * 17) % 45  # stagger rings so points don't line up
            lat, lng = _offset(report.location.lat, report.location.lng, km, bearing)
            ev = provider.quick(lat, lng, report.radius_m)
            scanned += 1
            ratings = rate_all(ev)
            level = overall_level(ratings)
            if LEVEL_ORDER.index(level) >= LEVEL_ORDER.index(origin) or level in ("high", "elevated"):
                continue
            candidates.append(
                Alternative(
                    lat=round(lat, 6),
                    lng=round(lng, 6),
                    distance_km=km,
                    bearing=COMPASS[round(bearing / 45) % 8],
                    overall=level,
                    ratings={d: r.level for d, r in ratings.items()},
                    highlights=_highlights(ev),
                )
            )
    candidates.sort(key=lambda a: (LEVEL_ORDER.index(a.overall), a.distance_km))
    # Prefer spread-out suggestions: at most one per direction.
    picked: list[Alternative] = []
    for c in candidates:
        if all(c.bearing != p.bearing for p in picked):
            picked.append(c)
        if len(picked) == limit:
            break
    return AlternativesResponse(
        origin_overall=origin,
        alternatives=picked,
        scanned=scanned,
        illustrative=report.versions.get("evidence_provider") == "mock",
    )
