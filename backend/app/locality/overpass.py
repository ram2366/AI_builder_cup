"""OpenStreetMap Overpass API client for amenities and POIs.

Fetches schools, healthcare, supermarkets, transit, cafes, and parks within a radius.
Backup source when Google Places is unavailable. Returns None on failure; it never invents places.
"""

import json
import logging
import math
import urllib.parse
import urllib.request
from typing import Any

from app.schemas import AmenitySummary, POICategory, POIItem

log = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT_SECONDS = 8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    R = 6371000  # radius of Earth in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _classify_osm_element(tags: dict[str, str]) -> tuple[POICategory, str] | None:
    amenity = tags.get("amenity", "")
    shop = tags.get("shop", "")
    railway = tags.get("railway", "")
    highway = tags.get("highway", "")
    leisure = tags.get("leisure", "")

    # Transit
    if railway in ("subway_entrance", "station") or tags.get("station") == "subway":
        return "transit", "Metro / Train Station"
    if amenity in ("bus_station",) or highway in ("bus_stop",):
        return "transit", "Bus Stop"

    # Grocery & Daily Needs
    if shop in ("supermarket", "convenience", "grocery", "greengrocer", "bakery", "department_store"):
        return "grocery", shop.replace("_", " ").title()

    # Healthcare
    if amenity in ("hospital", "clinic", "pharmacy", "doctors") or "healthcare" in tags:
        return "healthcare", amenity.replace("_", " ").title()

    # Education
    if amenity in ("school", "college", "kindergarten", "university"):
        return "education", amenity.replace("_", " ").title()

    # Social & Dining
    if amenity in ("restaurant", "cafe", "bar", "pub", "fast_food", "food_court"):
        return "social", amenity.replace("_", " ").title()

    # Green & Parks
    if leisure in ("park", "garden", "playground", "fitness_centre"):
        return "green", leisure.replace("_", " ").title()

    return None


def fetch_amenities(lat: float, lng: float, radius_m: int = 2500) -> AmenitySummary | None:
    """Fetch amenities from OpenStreetMap Overpass API; None when it fails or finds nothing."""
    try:
        query = f"""
        [out:json][timeout:{TIMEOUT_SECONDS}];
        (
          node["amenity"~"school|college|kindergarten|hospital|clinic|pharmacy|restaurant|cafe|bar|pub|bus_station"](around:{radius_m},{lat},{lng});
          node["shop"~"supermarket|convenience|grocery|bakery"](around:{radius_m},{lat},{lng});
          node["railway"~"subway_entrance|station"](around:{radius_m * 1.5},{lat},{lng});
          node["highway"="bus_stop"](around:{radius_m},{lat},{lng});
          node["leisure"~"park|garden|playground|fitness_centre"](around:{radius_m},{lat},{lng});
        );
        out body 80;
        """
        data = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request(
            OVERPASS_URL,
            data=data,
            headers={"User-Agent": "SAMPAAA-LandLens/1.0 (Sustainability Project; mailto:contact@sampaaa.org)"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
            elements = raw.get("elements", [])
            if elements:
                return _parse_elements(elements, lat, lng)
    except Exception as exc:
        log.warning("Overpass API unavailable or timed out (%s)", exc)

    return None


def _parse_elements(elements: list[dict[str, Any]], center_lat: float, center_lng: float) -> AmenitySummary:
    pois: list[POIItem] = []
    counts: dict[str, int] = {k: 0 for k in ["transit", "education", "grocery", "healthcare", "social", "green"]}

    for el in elements:
        tags = el.get("tags", {})
        classification = _classify_osm_element(tags)
        if not classification:
            continue
        category, detail = classification
        name = tags.get("name") or tags.get("brand") or f"Unnamed {detail}"
        elat = el.get("lat") or el.get("center", {}).get("lat")
        elng = el.get("lon") or el.get("center", {}).get("lon")
        if elat is None or elng is None:
            continue

        dist = haversine_m(center_lat, center_lng, elat, elng)
        counts[category] = counts.get(category, 0) + 1
        pois.append(
            POIItem(
                id=f"osm_{el.get('id', len(pois))}",
                name=name,
                category=category,
                distance_m=dist,
                lat=elat,
                lng=elng,
                detail=detail,
            )
        )

    pois.sort(key=lambda p: p.distance_m)

    # Find nearest for each highlight category
    def find_nearest(cat: POICategory, detail_match: str | None = None) -> POIItem | None:
        for p in pois:
            if p.category == cat:
                if detail_match and detail_match.lower() not in (p.detail or "").lower() and detail_match.lower() not in p.name.lower():
                    continue
                return p
        return None

    return AmenitySummary(
        source="OpenStreetMap",
        nearest_metro=find_nearest("transit", "metro"),
        nearest_bus=find_nearest("transit", "bus"),
        nearest_grocery=find_nearest("grocery"),
        nearest_hospital=find_nearest("healthcare"),
        nearest_school=find_nearest("education"),
        counts_by_category=counts,
        pois=pois[:50],  # Keep top 50 closest POIs
    )
