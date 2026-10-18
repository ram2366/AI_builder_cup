"""Neighbourhood heat/green shaping and API stay hermetic."""

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import NeighborhoodHealth
from app.tools.earthengine import shape_neighborhood_health

client = TestClient(app)


def _raw() -> dict:
    return {
        "by_year": [
            {"year": year, "ndvi_median": 0.42 - (year - 2017) * 0.01, "lst_may_c": 31 + (year - 2017) * 0.25}
            for year in range(2017, 2026)
        ],
        "context": {
            "recent_ndvi": 0.34,
            "greener_pct": 61.4,
            "recent_lst_may_c": 33.2,
            "lst_may_delta_c": 1.8,
        },
    }


def test_neighborhood_health_shape_is_measured_typed_and_trended():
    shaped = shape_neighborhood_health(_raw())
    assert shaped is not None
    assert shaped.radius_m == 1000
    assert shaped.compare_radius_km == 5
    assert shaped.period == "2017-2025"
    assert shaped.recent_ndvi == 0.34
    assert shaped.greener_than_surroundings_pct == 61
    assert shaped.recent_lst_may_c == 33.2
    assert shaped.lst_may_delta_c == 1.8
    assert shaped.ndvi_trend and shaped.ndvi_trend.significant
    assert shaped.lst_trend and shaped.lst_trend.significant


def test_neighborhood_health_does_not_turn_missing_measurements_into_zero():
    shaped = shape_neighborhood_health({
        "by_year": [{"year": 2024, "ndvi_median": None, "lst_may_c": 30.1}],
        "context": {},
    })
    assert shaped is not None
    assert shaped.by_year["2024"].ndvi_median is None
    assert shaped.recent_ndvi is None
    assert shaped.lst_may_delta_c is None


def test_neighborhood_health_endpoint(monkeypatch):
    expected = NeighborhoodHealth.model_validate(shape_neighborhood_health(_raw()))
    monkeypatch.setattr("app.main.get_neighborhood_health", lambda _lat, _lng: expected)
    response = client.get("/api/locality/neighborhood-health?lat=12.97&lng=77.59")
    assert response.status_code == 200
    assert response.json()["compare_radius_km"] == 5
    assert client.get("/api/locality/neighborhood-health?lat=-100&lng=77.59").status_code == 422
