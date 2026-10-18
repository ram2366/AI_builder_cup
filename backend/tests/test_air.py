"""Urban air evidence is shaped without live Google or Earth Engine calls."""

from fastapi.testclient import TestClient

from app.locality import air
from app.main import app
from app.schemas import AirIndex, AirQualityReport
from app.tools.earthengine import shape_air_no2

client = TestClient(app)


def _index(value: int) -> dict:
    return {
        "code": "ind_cpcb",
        "displayName": "India AQI",
        "aqi": value,
        "aqiDisplay": str(value),
        "category": "Moderate",
        "dominantPollutant": "pm25",
    }


def test_air_report_prefers_indian_index_and_aggregates_local_days(monkeypatch):
    def fake_post(path: str, body: dict) -> dict:
        if path == "currentConditions:lookup":
            return {
                "dateTime": "2026-10-16T14:00:00Z",
                "regionCode": "in",
                "indexes": [{"code": "uaqi", "aqi": 55, "aqiDisplay": "55"}, _index(112)],
                "pollutants": [
                    {
                        "code": "pm25",
                        "displayName": "PM2.5",
                        "fullName": "Fine particulate matter",
                        "concentration": {"value": 41.25, "units": "MICROGRAMS_PER_CUBIC_METER"},
                    }
                ],
            }
        assert path == "history:lookup"
        return {
            "hoursInfo": [
                {"dateTime": "2026-10-15T20:00:00Z", "indexes": [_index(100)]},
                {"dateTime": "2026-10-15T21:00:00Z", "indexes": [_index(120)]},
            ]
        }

    monkeypatch.setattr(air, "_post", fake_post)
    monkeypatch.setattr(
        "app.tools.earthengine.air_no2_context",
        lambda _lat, _lng: shape_air_no2(
            [{"year": year, "no2_umol_m2": 40 + year - 2019} for year in range(2019, 2026)]
        ),
    )
    air._CACHE.clear()
    report = air.get_air_quality_report(12.9716, 77.5946)

    assert report.index.code == "ind_cpcb"
    assert report.index.aqi == 112
    assert report.index.dominant_pollutant == "pm25"
    assert report.pollutants[0].concentration == 41.25
    assert report.history_daily[0].date == "2026-10-16"  # UTC evening is next day in Bengaluru
    assert report.history_daily[0].aqi_mean == 110
    assert report.history_daily[0].hours == 2
    assert report.no2 and len(report.no2.by_year) == 7
    assert report.no2.trend and report.no2.trend.significant


def test_no2_shape_keeps_source_resolution_period_and_measured_values():
    shaped = shape_air_no2([
        {"year": 2019, "no2_umol_m2": 32.1239},
        {"year": 2020, "no2_umol_m2": None},
        {"year": 2021, "no2_umol_m2": 30.5},
    ])
    assert shaped["resolution_m"] == 1113
    assert shaped["period"] == "2019-2021"
    assert shaped["unit"] == "µmol/m²"
    assert shaped["by_year"] == {"2019": 32.124, "2021": 30.5}


def test_air_endpoint_and_invalid_coordinates(monkeypatch):
    expected = AirQualityReport(
        checked_at="2026-10-16T14:00:00Z",
        current_at="2026-10-16T14:00:00Z",
        timezone="Asia/Kolkata",
        index=AirIndex(
            code="ind_cpcb", display_name="India AQI", aqi=80, aqi_display="80", category="Satisfactory"
        ),
        pollutants=[],
        history_period="Unavailable",
        history_daily=[],
    )
    monkeypatch.setattr("app.main.get_air_quality_report", lambda _lat, _lng: expected)
    response = client.get("/api/locality/air?lat=12.97&lng=77.59")
    assert response.status_code == 200
    assert response.json()["index"]["code"] == "ind_cpcb"
    assert client.get("/api/locality/air?lat=120&lng=77.59").status_code == 422


def test_heatmap_tile_coordinates_are_validated_before_network():
    try:
        air.get_heatmap_tile(17, 0, 0)
    except air.AirQualityUnavailable as exc:
        assert "Invalid" in str(exc)
    else:
        raise AssertionError("invalid zoom should not be accepted")
