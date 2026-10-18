"""Nearby amenities from Google Places, with OpenStreetMap as a real (never invented) backup."""

import logging
from concurrent.futures import ThreadPoolExecutor

from app.locality import overpass
from app.schemas import AmenitySummary, POICategory, POIItem
from app.services import places

log = logging.getLogger(__name__)

CATEGORIES: list[POICategory] = ["transit", "grocery", "healthcare", "education", "social", "green"]
METRO_TYPES = {"subway_station", "light_rail_station"}
BUS_TYPES = {"bus_station", "bus_stop"}
MIN_REVIEWS = 10


class AmenitiesUnavailable(RuntimeError):
    pass


def _pretty(t: str | None) -> str | None:
    return t.replace("_", " ").capitalize() if t else None


def _google(lat: float, lng: float, radius_m: int) -> AmenitySummary:
    with ThreadPoolExecutor(max_workers=len(CATEGORIES)) as pool:
        found = dict(zip(CATEGORIES, pool.map(lambda c: places.nearby(lat, lng, radius_m, c), CATEGORIES)))

    pois: list[POIItem] = []
    seen: set[str] = set()
    for cat, items in found.items():
        for p in items:
            if p["id"] in seen:  # a place can match two categories; keep its first
                continue
            seen.add(p["id"])
            pois.append(POIItem(
                id=p["id"], name=p["name"], category=cat, distance_m=p["distance_m"], lat=p["lat"], lng=p["lng"],
                detail=_pretty(p["primary_type"]), rating=p["rating"], ratings=p["ratings"], maps_uri=p["maps_uri"],
            ))
    pois.sort(key=lambda p: p.distance_m)
    by_id = {p.id: p for p in pois}

    def nearest(cat: POICategory, types: set[str] | None = None) -> POIItem | None:
        # Headline cards use established places only (10+ Google reviews), so a home-collection lab
        # or a hobby class doesn't pass for "nearest healthcare" or "nearest school".
        for raw in found[cat]:  # already nearest-first
            established = cat == "transit" or (raw["ratings"] or 0) >= MIN_REVIEWS  # stops rarely get reviews
            if (types is None or types & set(raw["types"])) and established:
                return by_id[raw["id"]]
        return None

    return AmenitySummary(
        source="Google Places",
        nearest_metro=nearest("transit", METRO_TYPES),  # only real metro / light rail; never a bus station
        nearest_bus=nearest("transit", BUS_TYPES),
        nearest_grocery=nearest("grocery"),
        nearest_hospital=nearest("healthcare"),
        nearest_school=nearest("education"),
        # Places returns at most 20 per category, so counts read "20 or more" at the top end.
        counts_by_category={c: len(found[c]) for c in CATEGORIES},
        pois=pois[:60],
    )


def fetch_amenities(lat: float, lng: float, radius_m: int) -> AmenitySummary:
    try:
        return _google(lat, lng, radius_m)
    except Exception as exc:
        log.warning("Google Places amenities failed (%s); trying OpenStreetMap", exc)
    osm = overpass.fetch_amenities(lat, lng, radius_m)
    if osm is not None:
        return osm
    raise AmenitiesUnavailable("No amenity source answered for this location. Please try again shortly.")
