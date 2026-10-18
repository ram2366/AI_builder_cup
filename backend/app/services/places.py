"""Google Places API (New): address search for the search box and nearby amenities for the locality lens.

The key stays on the server. Search uses session tokens so a burst of keystrokes plus the final
selection bills as one session.
"""

from __future__ import annotations

import logging
import math
import time
from functools import lru_cache

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
API = "https://places.googleapis.com/v1"


class PlacesUnavailable(RuntimeError):
    pass


def _key() -> str:
    k = get_settings().google_maps_api_key
    if not k:
        raise PlacesUnavailable("GOOGLE_MAPS_API_KEY is not set")
    return k


@lru_cache
def _client() -> httpx.Client:
    return httpx.Client(timeout=10)


def _post(path: str, body: dict, field_mask: str) -> dict:
    res = _client().post(
        f"{API}/{path}", json=body, headers={"X-Goog-Api-Key": _key(), "X-Goog-FieldMask": field_mask}
    )
    if res.status_code != 200:
        raise PlacesUnavailable(f"Places {path} failed ({res.status_code}): {res.text[:200]}")
    return res.json()


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)))


# ---------- search box ----------

def autocomplete(q: str, session: str, lat: float | None = None, lng: float | None = None) -> list[dict]:
    body: dict = {"input": q, "sessionToken": session, "languageCode": "en"}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 50000.0}}
    data = _post(
        "places:autocomplete",
        body,
        "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
    )
    out = []
    for s in data.get("suggestions", []):
        p = s.get("placePrediction")
        if not p:
            continue
        fmt = p.get("structuredFormat", {})
        out.append({
            "id": p["placeId"],
            "name": fmt.get("mainText", {}).get("text", ""),
            "detail": fmt.get("secondaryText", {}).get("text", ""),
        })
    return out[:6]


def place_location(place_id: str, session: str) -> dict:
    res = _client().get(
        f"{API}/places/{place_id}",
        params={"sessionToken": session, "languageCode": "en"},
        headers={"X-Goog-Api-Key": _key(), "X-Goog-FieldMask": "id,displayName,formattedAddress,location"},
    )
    if res.status_code != 200:
        raise PlacesUnavailable(f"Place details failed ({res.status_code})")
    d = res.json()
    return {
        "id": d["id"],
        "name": d.get("displayName", {}).get("text", ""),
        "detail": d.get("formattedAddress", ""),
        "lat": d["location"]["latitude"],
        "lng": d["location"]["longitude"],
    }


# ---------- locality amenities ----------

# Google place types per locality category. "metro" means rapid transit (subway / light rail).
CATEGORY_TYPES: dict[str, list[str]] = {
    "transit": ["subway_station", "light_rail_station", "train_station", "bus_station", "bus_stop"],
    "grocery": ["supermarket", "grocery_store", "market"],
    "healthcare": ["hospital", "pharmacy", "medical_clinic"],
    "education": ["school", "primary_school", "secondary_school", "preschool"],
    "social": ["restaurant", "cafe"],
    "green": ["park"],
}

_NEARBY_CACHE: dict[tuple, tuple[float, list[dict]]] = {}
_NEARBY_TTL_S = 24 * 3600  # Google allows short-term caching only


def nearby(lat: float, lng: float, radius_m: int, category: str) -> list[dict]:
    """Up to 20 real places of one category, nearest first."""
    key = (round(lat, 4), round(lng, 4), radius_m, category)
    hit = _NEARBY_CACHE.get(key)
    if hit and time.time() - hit[0] < _NEARBY_TTL_S:
        return hit[1]
    data = _post(
        "places:searchNearby",
        {
            "includedTypes": CATEGORY_TYPES[category],
            "maxResultCount": 20,
            "rankPreference": "DISTANCE",
            "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius_m)}},
            "languageCode": "en",
        },
        "places.id,places.displayName,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri",
    )
    out = []
    for p in data.get("places", []):
        loc = p["location"]
        out.append({
            "id": p["id"],
            "name": p.get("displayName", {}).get("text", "Unnamed"),
            "lat": loc["latitude"],
            "lng": loc["longitude"],
            "primary_type": p.get("primaryType"),
            "types": p.get("types", []),
            "rating": p.get("rating"),
            "ratings": p.get("userRatingCount"),
            "maps_uri": p.get("googleMapsUri"),
            "distance_m": distance_m(lat, lng, loc["latitude"], loc["longitude"]),
        })
    out.sort(key=lambda p: p["distance_m"])
    _NEARBY_CACHE[key] = (time.time(), out)
    return out


# ---------- neighbourhood name (Geocoding API, reverse) ----------

def neighbourhood(lat: float, lng: float) -> str | None:
    """e.g. "Thigalarapalya, Hoodi, Bengaluru": the area people actually discuss online."""
    res = _client().get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"latlng": f"{lat},{lng}", "result_type": "neighborhood|sublocality|locality", "key": _key()},
    )
    data = res.json() if res.status_code == 200 else {}
    for r in data.get("results", []):
        parts = [p.strip() for p in r.get("formatted_address", "").split(",")]
        # Drop "Karnataka 560048" and "India": state, postcode and country add nothing to a search.
        parts = [p for p in parts[:-1] if not any(ch.isdigit() for ch in p)] if len(parts) > 2 else parts
        if parts:
            return ", ".join(parts[:3])
    return None
