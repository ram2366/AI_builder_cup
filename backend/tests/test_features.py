from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _report(lat, lng, rid):
    r = client.post("/api/reports", json={"lat": lat, "lng": lng, "report_id": rid, "label": rid})
    assert r.json()["status"] == "done"
    return r.json()


def test_water_history_goes_back_to_1984():
    rep = _report(12.9505, 77.7005, "feat-water")
    years = sorted(rep["evidence"]["water_years"]["by_year"])
    assert years[0] == "1984" and years[-1] == "2021"


def test_action_kit_template_is_cached():
    _report(12.9505, 77.7005, "feat-actions")
    kit = client.post("/api/reports/feat-actions/actions").json()
    assert kit["generated_by"] == "template"
    assert len(kit["checklist"]) >= 3 and len(kit["builder_questions"]) >= 2
    assert any("lake" in q["text"].lower() for q in kit["builder_questions"])
    assert client.get("/api/reports/feat-actions").json()["actions"] == kit


def test_alternatives_are_safer_and_spread_out():
    _report(12.9505, 77.7005, "feat-alt")
    res = client.post("/api/reports/feat-alt/alternatives").json()
    assert res["origin_overall"] == "high" and res["scanned"] == 24 and res["illustrative"]
    alts = res["alternatives"]
    assert 1 <= len(alts) <= 3
    assert all(a["overall"] in ("low", "moderate") for a in alts)
    assert len({a["bearing"] for a in alts}) == len(alts)


def test_compare_picks_safest():
    _report(12.9505, 77.7005, "cmp-lake")
    _report(13.0315, 77.5905, "cmp-high")
    res = client.post("/api/compare", json={"report_ids": ["cmp-lake", "cmp-high"]}).json()
    assert res["best_id"] == "cmp-high"
    assert "cmp-high" in res["summary"]
    assert client.post("/api/compare", json={"report_ids": ["cmp-lake", "cmp-lake"]}).status_code == 422


def test_water_calendar_has_twelve_months_per_year():
    rep = _report(12.9505, 77.7005, "feat-months")
    months = rep["evidence"]["water_months"]["by_year"]
    assert min(months) == "1984" and max(months) == "2025"
    assert all(len(v) == 12 for v in months.values())
    assert months["2022"][8] == 0.18
