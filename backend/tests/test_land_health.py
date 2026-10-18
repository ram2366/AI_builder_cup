"""Hermetic tests for Land Health trend math and evidence shaping."""

from app.analytics import sen_mann_kendall
from app.agent.verifier import verify
from app.schemas import DimensionRating, Evidence, Finding, LandHealth, LandHealthYear, TrendResult
from app.tools.earthengine import _shape_land_health


def test_sen_mann_kendall_calls_clear_six_year_trend():
    trend = sen_mann_kendall([(2018 + i, 0.20 + i * 0.03) for i in range(6)])
    assert trend is not None
    assert trend.slope_per_year == 0.03
    assert trend.p_value < 0.05
    assert trend.significant is True


def test_sen_mann_kendall_needs_six_years_even_when_p_is_small():
    trend = sen_mann_kendall([(2019 + i, 0.1 + i * 0.1) for i in range(5)])
    assert trend is not None
    assert trend.n_years == 5
    assert trend.significant is False


def test_sen_mann_kendall_stable_tied_series_is_not_significant():
    trend = sen_mann_kendall([(2017 + i, value) for i, value in enumerate([0.4, 0.4, 0.41, 0.39, 0.4, 0.4])])
    assert trend is not None
    assert trend.slope_per_year == 0
    assert trend.significant is False


def test_shape_land_health_keeps_missing_values_missing_and_builds_trends():
    raw = {
        "by_year": [
            {
                "year": 2018 + i,
                "ndvi_median": 0.5 - i * 0.025,
                "ndvi_p10": 0.3 - i * 0.02,
                "ndvi_p90": 0.7 - i * 0.02,
                "mndwi_median": -0.2 + i * 0.01,
                "ndmi_median": 0.2 - i * 0.01,
                "ndmi_dry": 0.1 - i * 0.01,
                "ndmi_wet": 0.3 - i * 0.01,
                "ndbi_median": -0.2 + i * 0.02,
                "lst_may_c": None if i == 2 else 31 + i,
                "observations_s2": 20,
                "observations_lst": 0 if i == 2 else 2,
            }
            for i in range(6)
        ],
        "monthly_ndvi": [{"month": 1, "ndvi": 0.42}, {"month": 7, "ndvi": 0.68}],
        "context": {"ndvi_percentile": 63.7, "lst_may_delta_c": 2.34},
    }
    health = _shape_land_health(raw)
    assert health is not None
    assert health.by_year["2020"].lst_may_c is None
    assert health.monthly_ndvi_climatology == {"1": 0.42, "7": 0.68}
    assert health.context.ndvi_percentile == 64
    assert health.context.lst_may_delta_c == 2.3
    assert health.trends["ndvi"].significant is True
    assert health.ndvi_change == -0.1


def test_verifier_resolves_land_health_paths():
    evidence = Evidence(land_health=LandHealth(
        by_year={
            "2020": LandHealthYear(ndvi_median=0.2),
            "2025": LandHealthYear(ndvi_median=0.35),
        },
        trends={"ndvi": TrendResult(slope_per_year=0.03, p_value=0.009, significant=True, n_years=6)},
    ))
    finding = Finding(
        id="health-1",
        dimension="green",
        claim="NDVI increased by 0.03 per year across 6 years.",
        evidence_refs=["land_health.trends.ndvi.slope_per_year", "land_health.trends.ndvi.n_years"],
        severity="info",
    )
    result = verify(
        [finding],
        evidence,
        {"green": DimensionRating(level="low", confidence="medium", sources=[])},
    )
    assert result.stats.passed == 1
    assert result.stats.dropped == 0
