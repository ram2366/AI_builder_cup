"""Shaping raw Earth Engine numbers into evidence. Pure functions: no network, no quota."""

from datetime import datetime, timedelta, timezone

from app.tools.earthengine import (
    _shape_buildings,
    _shape_flood_hazard,
    _shape_historic_floods,
    _shape_jrc,
    _shape_landcover,
    _shape_monsoon,
    _shape_months,
    _shape_rain,
    _shape_terrain,
    _shape_water_years,
)


def test_years_with_too_few_observations_are_left_out_not_shown_dry():
    years = [
        {"year": 1984, "w": 0, "v": 10, "n": 100},  # barely seen: skip
        {"year": 1990, "w": 45, "v": 90, "n": 100},
        {"year": 2000, "w": 0, "v": 100, "n": 100},
    ]
    assert _shape_water_years(years).by_year == {"1990": 0.5, "2000": 0.0}


def test_core_water_years_and_transition_name():
    years = [{"year": 2005, "cw": 8, "cv": 10, "cn": 10}, {"year": 2015, "cw": 1, "cv": 10, "cn": 10}]
    jrc = _shape_jrc({"core": 46.27, "area": 12.0, "transition": 6}, years)
    assert jrc.occurrence_core_pct == 46.3
    assert jrc.transition_core == "lost_seasonal"
    assert jrc.years_water_core == [2005]


def test_cloudy_months_have_no_reading():
    rows = [
        {"year": 2010, "month": 1, "w": 5, "v": 50, "n": 100},
        {"year": 2010, "month": 7, "w": 9, "v": 20, "n": 100},  # mostly cloud
    ]
    m = _shape_months(rows)["2010"]
    assert m[0] == 0.1 and m[6] is None and m[3] is None


def test_landcover_uses_mean_probabilities_and_normalises_them():
    lc = _shape_landcover({
        "2016": {"water": 0.2, "built": 0.6},
        "2017": {"water": 0.1, "built": 0.9},
        "2024": {"built": 0.8, "trees": 0.2},
        "2025": {"built": 1.0},
    })
    assert lc is not None
    assert lc.by_year["2016"].water == 0.25 and lc.by_year["2016"].built == 0.75
    assert lc.by_year["2025"].built == 1.0
    assert lc.comparison_windows["baseline"].period == "2016–2017"
    assert lc.comparison_windows["baseline"].mean.water == 0.175
    assert lc.comparison_windows["recent"].period == "2024–2025"
    assert lc.comparison_windows["recent"].mean.built == 0.9


def test_monsoon_counts_only_clear_scenes():
    jul_2020 = 1593561600000  # 2020-07-01 UTC
    scenes = [
        {"t": jul_2020, "w": 6, "v": 10, "n": 10},  # clear, wet
        {"t": jul_2020, "w": 9, "v": 2, "n": 10},  # cloudy: ignored even though "wet"
    ]
    m = _shape_monsoon(scenes, [5, 6, 7, 8, 9, 10])
    assert m.wet_months == [5, 6, 7, 8, 9, 10]
    assert m.seen == [2020] and m.obs_per_year == {"2020": 1} and m.observed_years == 1


def test_rain_heavy_days_three_day_max_and_local_wet_months():
    start = datetime(2015, 1, 1, tzinfo=timezone.utc)
    rows = []
    for day in range(730):
        when = start + timedelta(days=day)
        precipitation = 1.0 if when.month in (6, 7, 8, 9, 10, 11) else 0.0
        rows.append({"t": int(when.timestamp() * 1000), "precipitation": precipitation})
    rows[160]["precipitation"], rows[161]["precipitation"], rows[162]["precipitation"] = 70.0, 10.0, 30.0
    r = _shape_rain(rows)
    assert r is not None
    assert r.max_3day_mm == 110
    assert r.heavy_days_per_year_avg == 0.5
    assert r.wet_months == [6, 7, 8, 9, 10, 11]
    assert set(r.monthly_climatology_mm) == {str(month) for month in range(1, 13)}


def test_fabdem_terrain_shaping_keeps_merit_only_as_drainage_context():
    terrain = _shape_terrain({
        "plot_elevation": 905.24,
        "context_500m": {"relative": -2.25, "higher": 0.82},
        "context_2km": {"relative": -4.8, "higher": 0.76},
        "hand": 3.44,
    })
    assert terrain is not None
    assert terrain.resolution_m == 30 and terrain.drainage_resolution_m == 90
    assert terrain.relative_height_500m_m == -2.2
    assert terrain.lower_than_500m_pct == 82
    assert terrain.lower_than_pct == 76


def test_open_buildings_shaping_reports_detection_not_exact_build_date():
    buildings = _shape_buildings([
        {"year": 2016, "presence_max": 0.2, "estimated_count": 0.1, "mean_height_m": None},
        {"year": 2017, "presence_max": 0.4, "estimated_count": 0.3, "mean_height_m": None},
        {"year": 2018, "presence_max": 0.8, "estimated_count": 2.2, "mean_height_m": 4.8},
        {"year": 2019, "presence_max": 0.9, "estimated_count": 5.5, "mean_height_m": 5.2},
    ])
    assert buildings is not None
    assert buildings.first_detected_year == 2018
    assert buildings.strongest_growth_year == 2019
    assert buildings.by_year["2019"].estimated_count == 5.5


def test_historic_floods_require_clear_coverage_and_one_percent_overlap():
    stamp = int(datetime(2013, 8, 1, tzinfo=timezone.utc).timestamp() * 1000)
    floods = _shape_historic_floods([
        {"event_id": 1, "t": stamp, "flooded": 30, "valid": 100, "total": 100},
        {"event_id": 2, "t": stamp, "flooded": 1, "valid": 20, "total": 100},
        {"event_id": 3, "t": stamp, "flooded": 0.5, "valid": 100, "total": 100},
    ])
    assert len(floods.events) == 1
    assert floods.events[0].event_id == 1
    assert floods.max_flooded_fraction == 0.3
    assert floods.latest_event_year == 2013


def test_wri_hazard_shaping_preserves_regional_resolution():
    hazard = _shape_flood_hazard({"exposed_fraction": 0.4, "mean_depth_m": 0.18, "max_depth_m": 0.72})
    assert hazard is not None
    assert hazard.resolution_m == 1000
    assert hazard.return_period_years == 100
    assert hazard.inundation_depth_max_m == 0.72
