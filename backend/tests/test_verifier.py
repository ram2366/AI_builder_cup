from app.agent.fallback import build_findings
from app.agent.verifier import resolve, verify
from app.rules import rate_all
from app.schemas import (
    BuildingHistory,
    BuildingYear,
    Finding,
    FloodHazard,
    HistoricFloodEvent,
    HistoricFloods,
    RatingChange,
    S1Flood,
)
from app.tools.mock import former_lake_layout, high_ground_control


def _f(claim: str, refs: list[str], **kw) -> Finding:
    return Finding(id="t", dimension=kw.pop("dimension", "flood"), claim=claim,
                   evidence_refs=refs, severity="watch", **kw)


def test_template_findings_all_pass():
    for make in (former_lake_layout, high_ground_control):
        ev = make()
        ratings = rate_all(ev)
        res = verify(build_findings(ev, ratings), ev, ratings)
        assert res.stats.dropped == 0, res.stats.issues
        assert res.stats.passed == len(res.findings) > 0


def test_resolve_paths():
    model = former_lake_layout()
    model.buildings = BuildingHistory(
        by_year={
            "2016": BuildingYear(presence_max=0.1, estimated_count=0),
            "2019": BuildingYear(presence_max=0.9, estimated_count=4.2, mean_height_m=5.1),
        },
        first_detected_year=2019,
        strongest_growth_year=2019,
    )
    model.historic_floods = HistoricFloods(
        events=[HistoricFloodEvent(event_id=42, year=2017, flooded_fraction=0.22)],
        max_flooded_fraction=0.22,
        latest_event_year=2017,
    )
    model.flood_hazard = FloodHazard(
        exposed_fraction=0.4,
        inundation_depth_mean_m=0.2,
        inundation_depth_max_m=0.8,
    )
    ev = model.model_dump(mode="json")
    assert resolve(ev, "jrc.occurrence_core_pct") == (True, 46)
    assert resolve(ev, "landcover.by_year.2016.water") == (True, 0.31)
    assert resolve(ev, "vision.0.year") == (True, 2017)
    assert resolve(ev, "landcover.green_by_year.2025")[0]
    assert resolve(ev, "terrain.relative_height_500m_m") == (True, -2.8)
    assert resolve(ev, "terrain.lower_than_2km_pct") == (True, 79)
    assert resolve(ev, "buildings.first_detected_year") == (True, 2019)
    assert resolve(ev, "buildings.by_year.2019.mean_height_m") == (True, 5.1)
    assert resolve(ev, "historic_floods.events.0.flooded_fraction") == (True, 0.22)
    assert resolve(ev, "flood_hazard.inundation_depth_max_m") == (True, 0.8)
    assert resolve(ev, "rain.wet_months") == (True, [6, 7, 8, 9, 10, 11])
    assert resolve(ev, "rain.monthly_climatology_mm.9") == (True, 171)
    assert resolve(ev, "nope.x") == (False, None)


def test_wrong_number_is_dropped():
    ev = former_lake_layout()
    r = rate_all(ev)
    res = verify([_f("Monsoon water was seen in 7 of 9 monsoons.", ["monsoon.seen", "monsoon.observed_years"])], ev, r)
    assert res.stats.dropped == 1
    assert "7" in res.stats.issues[0]


def test_percent_of_fraction_is_accepted():
    ev = former_lake_layout()
    ev.s1 = S1Flood(event="2022-09-05", flooded_fraction_aoi=0.18)
    res = verify([_f("About 18% of the area was under water.", ["s1.flooded_fraction_aoi"])], ev, rate_all(ev))
    assert res.stats.passed == 1


def test_signed_evidence_number_is_accepted():
    ev = former_lake_layout()
    ev.land_health = None
    ev.embedding.change = -0.18
    res = verify([_f("The change score was -0.18.", ["embedding.change"], dimension="green")], ev, rate_all(ev))
    assert res.stats.passed == 1


def test_uncited_and_unknown_refs_are_dropped():
    ev = former_lake_layout()
    res = verify([_f("It flooded.", []), _f("It flooded.", ["made.up"])], ev, rate_all(ev))
    assert res.stats.dropped == 2


def test_forecasts_and_guarantees_are_blocked():
    ev = former_lake_layout()
    r = rate_all(ev)
    for claim in ["This plot will likely flood again.", "A flood-free location.",
                  "The land is safe.", "The plot has a clear title."]:
        assert verify([_f(claim, ["monsoon.seen"])], ev, r).stats.dropped == 1, claim


def test_rating_change_rules():
    ev = high_ground_control()
    ev.monsoon.seen = [2022]  # moderate flood baseline
    r = rate_all(ev)
    assert r["flood"].level == "moderate"

    ok = RatingChange(dimension="flood", **{"from": "moderate"}, to="elevated", because=["monsoon.seen"])
    res = verify([_f("Monsoon water was seen in 2022.", ["monsoon.seen"], rating_change=ok)], ev, r)
    assert res.stats.passed == 1 and res.ratings["flood"].level == "elevated"

    jump = RatingChange(dimension="flood", **{"from": "moderate"}, to="high", because=["monsoon.seen"])
    down = RatingChange(dimension="flood", **{"from": "moderate"}, to="low", because=["monsoon.seen"])
    weak = RatingChange(dimension="flood", **{"from": "moderate"}, to="elevated", because=["terrain.hand_m"])
    for rc in (jump, down, weak):
        res = verify([_f("Monsoon water was seen in 2022.", ["monsoon.seen"], rating_change=rc)], ev, r)
        assert res.stats.dropped == 1
        assert res.ratings["flood"].level == "moderate"
