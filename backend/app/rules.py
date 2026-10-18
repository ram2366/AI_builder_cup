"""Deterministic baseline ratings and confidence.

The LLM never sets a rating or a confidence. It may only *raise* a rating by one level with
cited corroborating evidence (see agent/verifier.py). Thresholds are v0 and get tuned on the
eval set; keep them here so the methodology stays transparent and reviewable.
"""

from dataclasses import dataclass

from app.schemas import (
    LEVEL_ORDER,
    Confidence,
    Dimension,
    DimensionRating,
    Evidence,
    Level,
)

LOST_WATER_TRANSITIONS = {"lost_permanent", "lost_seasonal"}
FINE_RESOLUTION_M = 30


@dataclass(frozen=True)
class Signal:
    """One independent source that supports a risk finding."""

    source: str
    resolution_m: int


def confidence(signals: list[Signal]) -> Confidence:
    fine = any(s.resolution_m <= FINE_RESOLUTION_M for s in signals)
    if len(signals) >= 2 and fine:
        return "high"
    if (len(signals) == 1 and fine) or len(signals) >= 2:
        return "medium"
    return "low"


def _rating(level: Level, signals: list[Signal], primary_fine: bool) -> DimensionRating:
    # A "low" rating has no supporting signals by definition; its confidence reflects whether
    # fine-resolution data was actually looked at.
    if level == "low":
        conf: Confidence = "medium" if primary_fine else "low"
    else:
        conf = confidence(signals)
    return DimensionRating(level=level, confidence=conf, sources=[s.source for s in signals])


def rate_water_body(ev: Evidence) -> DimensionRating | None:
    j = ev.jrc
    if j is None:
        return None
    if j.transition_core in LOST_WATER_TRANSITIONS or j.occurrence_core_pct >= 25:
        level: Level = "high"
    elif j.occurrence_core_pct >= 5 or j.occurrence_area_pct >= 25:
        level = "elevated"
    elif j.occurrence_area_pct >= 5:
        level = "moderate"
    else:
        level = "low"

    signals: list[Signal] = []
    if level != "low":
        signals.append(Signal("JRC Global Surface Water", j.resolution_m))
        if any(v.water_visible and v.year <= 2019 for v in ev.vision):
            signals.append(Signal("Gemini reading of Sentinel-2 imagery", 10))
        if ev.landcover and ev.landcover.comparison_windows:
            baseline = ev.landcover.comparison_windows["baseline"].mean
            if baseline.water + baseline.flooded_vegetation >= 0.10:
                signals.append(Signal("Dynamic World land cover", ev.landcover.resolution_m))
    return _rating(level, signals, primary_fine=True)


def rate_flood(ev: Evidence) -> DimensionRating | None:
    m = ev.monsoon
    historic = ev.historic_floods
    hazard = ev.flood_hazard
    if m is None and ev.s1 is None and historic is None and hazard is None:
        return None
    wet = len(m.seen) if m else 0
    s1_frac = ev.s1.flooded_fraction_aoi if ev.s1 else 0.0
    historic_frac = historic.max_flooded_fraction if historic else 0.0
    hazard_exposure = hazard.exposed_fraction if hazard else 0.0
    hazard_depth = hazard.inundation_depth_max_m if hazard else 0.0
    low_lying = ev.terrain is not None and (
        ev.terrain.lower_than_500m_pct >= 70 or ev.terrain.hand_m < 5
    )

    if wet >= 3 or s1_frac >= 0.10 or historic_frac >= 0.30:
        level: Level = "high"
    elif wet == 2 or (wet == 1 and low_lying) or historic_frac >= 0.10:
        level = "elevated"
    elif wet == 1 or s1_frac >= 0.03 or historic_frac >= 0.03 or (hazard_exposure >= 0.10 and hazard_depth >= 0.25):
        level = "moderate"
    else:
        level = "low"

    signals: list[Signal] = []
    if level != "low":
        if wet:
            signals.append(Signal("Dynamic World wet-season scenes", 10))
        if s1_frac >= 0.03:
            signals.append(Signal("Sentinel-1 radar", 10))
        if historic_frac >= 0.03 and historic:
            signals.append(Signal(historic.source, historic.resolution_m))
        if hazard_exposure >= 0.10 and hazard_depth >= 0.25 and hazard:
            signals.append(Signal(hazard.source, hazard.resolution_m))
        if ev.news:
            signals.append(Signal("Local news reports", 1000))
        if low_lying:
            signals.append(Signal("FABDEM terrain", 30))
    return _rating(level, signals, primary_fine=m is not None or ev.terrain is not None)


def rate_terrain(ev: Evidence) -> DimensionRating | None:
    t = ev.terrain
    if t is None:
        return None
    local = t.lower_than_500m_pct
    broad = t.lower_than_2km_pct
    if local >= 80 and broad >= 80:
        level: Level = "high"
    elif broad >= 75 or (local >= 70 and broad >= 60) or (t.relative_height_500m_m <= -2 and broad >= 60):
        level = "elevated"
    # A single 500 m hollow is not enough to flag an otherwise high 2 km setting. Requiring broad
    # corroboration keeps small neighbourhood undulations from becoming plot-level warnings.
    elif broad >= 60 or (local >= 60 and broad >= 50) or (t.relative_height_500m_m <= -1 and broad >= 50):
        level = "moderate"
    else:
        level = "low"
    signals: list[Signal] = []
    if level != "low":
        signals.append(Signal(t.source, t.resolution_m))
        if t.hand_m < 5:
            signals.append(Signal(t.drainage_source, t.drainage_resolution_m))
    return _rating(level, signals, primary_fine=True)


def rate_green(ev: Evidence) -> DimensionRating | None:
    lc = ev.landcover
    if lc is None or len(lc.by_year) < 2:
        return None
    windows = lc.comparison_windows
    baseline, recent = windows["baseline"].mean, windows["recent"].mean
    baseline_green = baseline.trees + baseline.grass + baseline.shrub_and_scrub
    recent_green = recent.trees + recent.grass + recent.shrub_and_scrub
    drop_pts = (baseline_green - recent_green) * 100
    if drop_pts >= 30:
        level: Level = "high"
    elif drop_pts >= 15:
        level = "elevated"
    elif drop_pts >= 5:
        level = "moderate"
    else:
        level = "low"
    signals: list[Signal] = []
    if level != "low":
        signals.append(Signal("Dynamic World land cover", lc.resolution_m))
        if ev.embedding and ev.embedding.change >= 0.3:
            signals.append(Signal("AlphaEarth embeddings", ev.embedding.resolution_m))
    return _rating(level, signals, primary_fine=True)


def rate_rain(ev: Evidence) -> DimensionRating | None:
    r = ev.rain
    if r is None:
        return None
    # Regional context only: never HIGH, and it never drives the overall rating.
    if r.heavy_days_per_year_avg >= 5:
        level: Level = "elevated"
    elif r.heavy_days_per_year_avg >= 2:
        level = "moderate"
    else:
        level = "low"
    signals = [Signal("CHIRPS rainfall", r.resolution_m)] if level != "low" else []
    return _rating(level, signals, primary_fine=False)


def rate_land_health(ev: Evidence) -> DimensionRating | None:
    health = ev.land_health
    if health is None:
        return None
    ndvi = health.trends.get("ndvi")
    decline = (
        ndvi is not None
        and ndvi.significant
        and ndvi.slope_per_year <= -0.02
        and health.ndvi_change is not None
        and health.ndvi_change <= -0.1
    )
    heat = health.context.lst_may_delta_c is not None and health.context.lst_may_delta_c >= 3

    # A sustained 0.02 NDVI/year decline plus a 0.1 two-window loss is large enough to separate
    # land conversion from ordinary seasonal noise. A 3 °C May surface anomaly flags local heat.
    if decline:
        level: Level = "elevated"
    elif heat:
        level = "moderate"
    else:
        level = "low"

    signals: list[Signal] = []
    if decline:
        signals.append(Signal(health.source, health.resolution_m))
    if heat:
        signals.append(Signal(health.lst_source, health.lst_resolution_m))
    return _rating(level, signals, primary_fine=True)


RATERS = {
    "water_body": rate_water_body,
    "flood": rate_flood,
    "terrain": rate_terrain,
    "green": rate_green,
    "land_health": rate_land_health,
    "rain": rate_rain,
}


def rate_all(ev: Evidence) -> dict[Dimension, DimensionRating]:
    out: dict[Dimension, DimensionRating] = {}
    for dim, fn in RATERS.items():
        r = fn(ev)
        if r is not None:
            out[dim] = r  # type: ignore[index]
    return out


def overall_level(ratings: dict[Dimension, DimensionRating]) -> Level:
    levels = [r.level for d, r in ratings.items() if d != "rain"]
    if not levels:
        return "low"
    return max(levels, key=LEVEL_ORDER.index)


def raise_one(level: Level) -> Level:
    i = LEVEL_ORDER.index(level)
    return LEVEL_ORDER[min(i + 1, len(LEVEL_ORDER) - 1)]
