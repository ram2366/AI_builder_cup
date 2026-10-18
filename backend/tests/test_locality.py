"""Locality lens. Hermetic: Google Places and Overpass are faked, so no network or billing."""

import pytest
from fastapi.testclient import TestClient

from app.locality import amenities, service
from app.locality.scoring import calculate_scores
from app.locality.sentiment import analyze_sentiment
from app.main import app
from app.schemas import AmenitySummary, POIItem

client = TestClient(app)


def _poi(i: str, cat: str, d: int) -> POIItem:
    return POIItem(id=i, name=i, category=cat, distance_m=d, lat=12.97, lng=77.64)  # type: ignore[arg-type]


def _place(pid: str, d: int, types: list[str], ratings: int | None = 50) -> dict:
    return {"id": pid, "name": pid, "lat": 12.97, "lng": 77.64, "primary_type": types[0], "types": types,
            "rating": 4.2, "ratings": ratings, "maps_uri": None, "distance_m": d}


def test_scoring_uses_only_measured_amenities():
    summary = AmenitySummary(
        source="Google Places",
        nearest_metro=_poi("metro", "transit", 650),
        nearest_bus=_poi("bus", "transit", 120),
        nearest_grocery=_poi("grocer", "grocery", 280),
        nearest_hospital=_poi("hospital", "healthcare", 850),
        nearest_school=_poi("school", "education", 450),
        counts_by_category={"transit": 8, "grocery": 12, "healthcare": 5, "education": 4, "social": 20, "green": 3},
    )
    score, sub = calculate_scores(summary)
    assert set(sub) == {"essentials", "transit", "education", "social"}  # opinions are never scored
    assert abs(sum(s.weight for s in sub.values()) - 1) < 1e-9
    assert 75 <= score <= 100
    assert "20+" in sub["social"].summary


def test_missing_metro_is_said_plainly():
    _, sub = calculate_scores(AmenitySummary(source="Google Places", counts_by_category={}))
    assert "no metro station found" in sub["transit"].summary


@pytest.fixture
def fake_places(monkeypatch):
    found = {
        "transit": [_place("bus-stand", 300, ["bus_station"], None), _place("metro", 900, ["subway_station"], None)],
        "grocery": [_place("tiny-shop", 20, ["grocery_store"], 2), _place("supermarket", 400, ["supermarket"], 120)],
        "healthcare": [_place("clinic", 500, ["medical_clinic"], 30)],
        "education": [],
        "social": [_place("cafe", 100, ["cafe"], 300)],
        "green": [],
    }
    monkeypatch.setattr(amenities.places, "nearby", lambda lat, lng, r, cat: found[cat])
    return found


def test_metro_is_only_ever_a_metro(fake_places):
    a = amenities.fetch_amenities(12.97, 77.64, 2500)
    assert a.source == "Google Places"
    assert a.nearest_metro and a.nearest_metro.id == "metro"  # the closer bus station never stands in
    assert a.nearest_bus and a.nearest_bus.id == "bus-stand"


def test_headline_cards_skip_barely_reviewed_places(fake_places):
    a = amenities.fetch_amenities(12.97, 77.64, 2500)
    assert a.nearest_grocery and a.nearest_grocery.id == "supermarket"
    assert a.nearest_school is None
    assert any(p.id == "tiny-shop" for p in a.pois)  # still listed, just not headlined


def test_no_metro_nearby_stays_none(monkeypatch, fake_places):
    fake_places["transit"] = [_place("bus-stand", 300, ["bus_station"], None)]
    assert amenities.fetch_amenities(20.01, 73.79, 2500).nearest_metro is None


def test_when_every_source_fails_the_api_says_so(monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("down")

    monkeypatch.setattr(amenities.places, "nearby", boom)
    monkeypatch.setattr(amenities.overpass, "fetch_amenities", lambda *a, **k: None)
    service._CACHE.clear()
    res = client.post("/api/locality", json={"lat": 1.0, "lng": 2.0, "label": "Nowhere"})
    assert res.status_code == 503
    assert "No amenity source" in res.json()["detail"]


def test_sentiment_is_unavailable_without_gemini_not_invented():
    s = analyze_sentiment("Koramangala, Bengaluru")  # tests run with the agent disabled
    assert s.available is False and s.summary == "" and s.sources == []


def test_locality_endpoint_with_fake_places(fake_places):
    service._CACHE.clear()
    res = client.post("/api/locality", json={"lat": 12.9352, "lng": 77.6245, "label": "Koramangala, Bengaluru"})
    assert res.status_code == 200
    data = res.json()
    assert data["amenities"]["source"] == "Google Places"
    assert data["sentiment"]["available"] is False
    assert data["verdict_summary"].startswith("Within 2.5 km (Google Places)")
