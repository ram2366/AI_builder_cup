from app.rules import confidence, overall_level, rate_all, Signal
from app.schemas import (
    FloodHazard,
    HistoricFloodEvent,
    HistoricFloods,
    LandHealth,
    LandHealthContext,
    LandHealthYear,
    Monsoon,
    Rain,
    S1Flood,
    Terrain,
    TrendResult,
)
from app.tools.mock import former_lake_layout, high_ground_control


def test_former_lake_is_high_risk_with_high_confidence():
    r = rate_all(former_lake_layout())
    assert r["water_body"].level == "high"
    assert r["water_body"].confidence == "high"
    assert r["flood"].level == "high"
    assert r["terrain"].level == "elevated"
    assert r["green"].level == "elevated"
    assert r["rain"].level == "moderate"
    assert overall_level(r) == "high"


def test_control_is_not_flagged():
    r = rate_all(high_ground_control())
    assert overall_level(r) == "low"
    assert r["water_body"].level == "low"
    assert r["flood"].level == "low"


def test_rain_never_drives_overall():
    ev = high_ground_control()
    ev.rain = Rain(
        monthly_climatology_mm={str(month): float(month) for month in range(1, 13)},
        wet_months=[7, 8, 9, 10, 11, 12],
        heavy_days_per_year_avg=9,
        max_3day_mm=400,
    )
    r = rate_all(ev)
    assert r["rain"].level == "elevated"
    assert overall_level(r) == "low"


def test_s1_alone_can_flag_flood():
    ev = high_ground_control()
    ev.monsoon = Monsoon(wet_months=[6, 7, 8, 9, 10, 11], seen=[], observed_years=9)
    ev.s1 = S1Flood(event="2022-09-05", flooded_fraction_aoi=0.12)
    assert rate_all(ev)["flood"].level == "high"


def test_single_wet_year_on_low_ground_is_elevated():
    ev = high_ground_control()
    ev.monsoon = Monsoon(wet_months=[6, 7, 8, 9, 10, 11], seen=[2022], observed_years=9)
    ev.terrain = Terrain(
        plot_elevation_m=100,
        relative_height_500m_m=-2,
        relative_height_2km_m=-3,
        lower_than_500m_pct=75,
        lower_than_2km_pct=70,
        hand_m=3,
    )
    assert rate_all(ev)["flood"].level == "elevated"


def test_global_flood_database_can_flag_flood_without_recent_scene():
    ev = high_ground_control()
    ev.monsoon = None
    ev.historic_floods = HistoricFloods(
        events=[HistoricFloodEvent(event_id=7, year=2016, flooded_fraction=0.14)],
        max_flooded_fraction=0.14,
        latest_event_year=2016,
    )
    assert rate_all(ev)["flood"].level == "elevated"


def test_wri_hazard_is_only_a_moderate_regional_signal():
    ev = high_ground_control()
    ev.monsoon = None
    ev.flood_hazard = FloodHazard(
        exposed_fraction=0.6,
        inundation_depth_mean_m=0.3,
        inundation_depth_max_m=0.9,
    )
    assert rate_all(ev)["flood"].level == "moderate"


def test_fabdem_relative_height_drives_plot_terrain_rating():
    ev = high_ground_control()
    ev.terrain = Terrain(
        plot_elevation_m=100,
        relative_height_500m_m=-2.5,
        relative_height_2km_m=-4,
        lower_than_500m_pct=85,
        lower_than_2km_pct=84,
        hand_m=20,
    )
    assert rate_all(ev)["terrain"].level == "high"


def test_local_hollow_does_not_flag_broad_high_ground():
    ev = high_ground_control()
    ev.terrain = Terrain(
        plot_elevation_m=914.8,
        relative_height_500m_m=-2.9,
        relative_height_2km_m=9.1,
        lower_than_500m_pct=68,
        lower_than_2km_pct=22,
        hand_m=12.8,
    )
    assert rate_all(ev)["terrain"].level == "low"


def test_missing_data_omits_dimension():
    ev = high_ground_control()
    ev.terrain = None
    assert "terrain" not in rate_all(ev)


def test_land_health_decline_is_elevated():
    ev = high_ground_control()
    ev.land_health = LandHealth(
        by_year={
            "2017": LandHealthYear(ndvi_median=0.6),
            "2018": LandHealthYear(ndvi_median=0.58),
            "2024": LandHealthYear(ndvi_median=0.45),
            "2025": LandHealthYear(ndvi_median=0.43),
        },
        trends={"ndvi": TrendResult(slope_per_year=-0.025, p_value=0.01, significant=True, n_years=9)},
    )
    assert rate_all(ev)["land_health"].level == "elevated"


def test_land_health_heat_is_moderate_and_stable_control_is_low():
    ev = high_ground_control()
    ev.land_health = LandHealth(
        by_year={"2017": LandHealthYear(ndvi_median=0.3), "2025": LandHealthYear(ndvi_median=0.31)},
        context=LandHealthContext(lst_may_delta_c=3.2),
    )
    assert rate_all(ev)["land_health"].level == "moderate"
    ev.land_health.context.lst_may_delta_c = 0.5
    assert rate_all(ev)["land_health"].level == "low"


def test_confidence_rules():
    assert confidence([Signal("a", 10), Signal("b", 1000)]) == "high"
    assert confidence([Signal("a", 10)]) == "medium"
    assert confidence([Signal("a", 90), Signal("b", 5500)]) == "medium"
    assert confidence([Signal("a", 5500)]) == "low"
