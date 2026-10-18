from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz():
    assert client.get("/healthz").json()["ok"] is True


def test_examples_are_marked_demo_in_mock_mode():
    ex = client.get("/api/examples").json()
    assert len(ex) >= 3 and all(e["demo_data"] for e in ex)


def test_create_and_fetch_report():
    body = {"lat": 12.9505, "lng": 77.7005, "radius_m": 250, "lang": "en", "report_id": "test-1"}
    r = client.post("/api/reports", json=body)
    assert r.status_code == 200
    rep = r.json()
    assert rep["status"] == "done"
    assert rep["verdict"]["overall"] == "high"
    assert rep["verifier"]["dropped"] == 0
    assert all(f["evidence_refs"] for f in rep["findings"])
    assert rep["evidence"]["landcover"]["green_by_year"]["2016"] > 0
    assert client.get("/api/reports/test-1").json()["id"] == "test-1"
    # idempotent on report_id
    assert client.post("/api/reports", json=body).json()["created_at"] == rep["created_at"]


def test_control_example_is_low():
    rep = client.post("/api/reports", json={"lat": 13.0315, "lng": 77.5905}).json()
    assert rep["verdict"]["overall"] == "low"


def test_validation():
    assert client.post("/api/reports", json={"lat": 95, "lng": 0}).status_code == 422
    assert client.post("/api/reports", json={"lat": 1, "lng": 1, "radius_m": 50}).status_code == 422
    assert client.post("/api/reports", json={"lat": 1, "lng": 1, "radius_m": 2000}).status_code == 422
    assert client.get("/api/reports/missing").status_code == 404


def test_polygon_boundary_is_validated_and_stored():
    geometry = {
        "type": "Polygon",
        "coordinates": [[
            [77.6995, 12.9500],
            [77.7005, 12.9500],
            [77.7005, 12.9510],
            [77.6995, 12.9510],
            [77.6995, 12.9500],
        ]],
    }
    response = client.post(
        "/api/reports",
        json={"lat": 12.9505, "lng": 77.7000, "geometry": geometry, "report_id": "polygon-1"},
    )
    assert response.status_code == 200
    stored = response.json()["location"]["geometry"]
    assert stored["type"] == "Polygon"
    assert 10_000 < stored["area_m2"] < 15_000


def test_polygon_boundary_rejects_self_intersection_and_bad_area():
    bow_tie = [[
        [77.6995, 12.9500], [77.7005, 12.9510], [77.7005, 12.9500],
        [77.6995, 12.9510], [77.6995, 12.9500],
    ]]
    too_small = [[
        [77.7000, 12.9500], [77.70002, 12.9500], [77.70002, 12.95002],
        [77.7000, 12.95002], [77.7000, 12.9500],
    ]]
    too_large = [[
        [77.60, 12.85], [77.80, 12.85], [77.80, 13.05],
        [77.60, 13.05], [77.60, 12.85],
    ]]
    for coordinates in (bow_tie, too_small, too_large):
        response = client.post(
            "/api/reports",
            json={"lat": 12.9505, "lng": 77.7000, "geometry": {"type": "Polygon", "coordinates": coordinates}},
        )
        assert response.status_code == 422
