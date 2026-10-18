"""Commute checks are hermetic: no request reaches Google Routes."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.locality import routes
from app.main import app
from app.schemas import CommuteDestination, CommuteReport, CommuteTrip

client = TestClient(app)


def _stops() -> list[CommuteDestination]:
    return [
        CommuteDestination(kind="office", label="Office", lat=12.9718, lng=77.6412),
        CommuteDestination(kind="school", label="School", lat=12.9345, lng=77.6266),
    ]


def test_local_departures_use_the_origin_timezone():
    tz_name, peak, offpeak = routes._local_departures(
        12.9716,
        77.5946,
        datetime(2026, 10, 14, 12, tzinfo=timezone.utc),
    )
    assert tz_name == "Asia/Kolkata"
    assert peak.isoformat() == "2026-10-19T09:00:00+05:30"
    assert offpeak.isoformat() == "2026-10-19T14:00:00+05:30"


def test_commute_shapes_real_route_elements_and_keeps_missing_routes_null(monkeypatch):
    calls: list[tuple[str, int]] = []

    def fake_matrix(_lat, _lng, _destinations, mode, departure):
        calls.append((mode, departure.hour))
        durations = {
            ("DRIVE", 9): ("1800s", "1200s"),
            ("DRIVE", 14): ("1200s", "900s"),
            ("TRANSIT", 9): ("2400s", None),
        }[(mode, departure.hour)]
        return [
            {
                "destinationIndex": index,
                "condition": "ROUTE_EXISTS" if duration else "ROUTE_NOT_FOUND",
                "duration": duration,
                "distanceMeters": 10400 + index * 1000,
            }
            for index, duration in enumerate(durations)
        ]

    monkeypatch.setattr(routes, "_post_matrix", fake_matrix)
    report = routes.get_commute_report(
        12.9716,
        77.5946,
        _stops(),
        now=datetime(2026, 10, 14, 12, tzinfo=timezone.utc),
    )

    assert calls == [("DRIVE", 9), ("DRIVE", 14), ("TRANSIT", 9)]
    assert report.source == "Google Routes API"
    assert report.trips[0].drive_peak_minutes == 30
    assert report.trips[0].drive_offpeak_minutes == 20
    assert report.trips[0].peak_gap_minutes == 10
    assert report.trips[0].transit_minutes == 40
    assert report.trips[0].distance_km == 10.4
    assert report.trips[1].transit_minutes is None
    assert report.trips[1].transit_condition == "ROUTE_NOT_FOUND"


def test_commute_endpoint_and_three_destination_limit(monkeypatch):
    expected = CommuteReport(
        checked_at="2026-10-16T10:00:00Z",
        timezone="Asia/Kolkata",
        peak_departure_local="2026-10-19T09:00:00+05:30",
        offpeak_departure_local="2026-10-19T14:00:00+05:30",
        trips=[CommuteTrip(kind="office", label="Office", lat=12.9, lng=77.6, drive_peak_minutes=25)],
    )
    monkeypatch.setattr("app.main.get_commute_report", lambda *_args: expected)
    payload = {
        "origin_lat": 12.97,
        "origin_lng": 77.59,
        "destinations": [{"kind": "office", "label": "Office", "lat": 12.9, "lng": 77.6}],
    }
    response = client.post("/api/locality/commute", json=payload)
    assert response.status_code == 200
    assert response.json()["trips"][0]["drive_peak_minutes"] == 25

    payload["destinations"] *= 4
    assert client.post("/api/locality/commute", json=payload).status_code == 422
