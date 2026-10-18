"""Illustrative evidence packs for local development and UI work.

These numbers are MADE UP. They mirror the worked example in the plan and must never be shown
as real data for a real place.
"""

from app.schemas import (
    EmbeddingChange,
    Evidence,
    Landcover,
    LandcoverYear,
    Monsoon,
    NewsItem,
    Rain,
    S1Flood,
    Terrain,
    WaterMonths,
    WaterYears,
    VisionObs,
    WaterHistory,
)


def _lc(water: float, trees: float, grass: float, built: float, bare: float) -> LandcoverYear:
    shrub = round(max(0.0, 1 - water - trees - grass - built - bare), 3)
    return LandcoverYear(
        water=water, trees=trees, grass=grass, built=built, bare=bare, shrub_and_scrub=shrub
    )


def _rain(heavy_days: float, max_3day_mm: float) -> Rain:
    return Rain(
        monthly_climatology_mm={
            "1": 4, "2": 6, "3": 15, "4": 42, "5": 95, "6": 118,
            "7": 132, "8": 146, "9": 171, "10": 158, "11": 92, "12": 18,
        },
        wet_months=[6, 7, 8, 9, 10, 11],
        heavy_days_per_year_avg=heavy_days,
        max_3day_mm=max_3day_mm,
    )


def _lake_years() -> dict[str, float]:
    """A seasonal lake that stayed until the 2010s, then was filled in (illustrative)."""
    out = {}
    for y in range(1984, 2022):
        base = 0.42 if y < 2012 else max(0.03, 0.42 - (y - 2011) * 0.045)
        wiggle = 0.06 * ((y * 7) % 5 - 2) / 2  # wet and dry years
        out[str(y)] = round(max(0.0, base + wiggle), 3)
    return out


def _lake_months() -> dict[str, list[float | None]]:
    """Illustrative monthly water: monsoon-fed lake until 2011, filled in by 2018, flood in Sept 2022."""
    out: dict[str, list[float | None]] = {}
    for y in range(1984, 2026):
        if y < 2012:
            fill = 1.0
        elif y <= 2018:
            fill = max(0.0, 1 - (y - 2011) / 7)
        else:
            fill = 0.0
        months: list[float | None] = []
        for m in range(1, 13):
            season = {6: .55, 7: .8, 8: .95, 9: 1.0, 10: .9, 11: .7, 12: .5, 1: .4, 2: .3, 3: .2, 4: .15, 5: .2}[m]
            v = round(0.46 * season * fill + 0.02 * ((y * 13 + m * 7) % 5) / 4 * fill, 3)
            cloudy = m in (7, 8) and (y * 3 + m) % 7 == 0  # monsoon cloud: no clear image
            months.append(None if cloudy else v)
        out[str(y)] = months
    out["2022"][8] = 0.18  # Sept 2022 flood
    out["2022"][7] = 0.06
    out["2020"][9] = 0.03
    out["2021"][8] = 0.02
    return out


def former_lake_layout() -> Evidence:
    years = {
        "2016": _lc(0.31, 0.12, 0.35, 0.08, 0.08),
        "2017": _lc(0.29, 0.12, 0.34, 0.09, 0.10),
        "2018": _lc(0.18, 0.10, 0.30, 0.14, 0.22),
        "2019": _lc(0.08, 0.09, 0.26, 0.24, 0.27),
        "2020": _lc(0.05, 0.08, 0.22, 0.33, 0.25),
        "2021": _lc(0.04, 0.07, 0.19, 0.41, 0.22),
        "2022": _lc(0.06, 0.06, 0.16, 0.48, 0.17),
        "2023": _lc(0.03, 0.05, 0.14, 0.55, 0.15),
        "2024": _lc(0.02, 0.05, 0.13, 0.58, 0.14),
        "2025": _lc(0.02, 0.05, 0.12, 0.61, 0.12),
    }
    return Evidence(
        landcover=Landcover(by_year=years),
        water_years=WaterYears(by_year=_lake_years()),
        water_months=WaterMonths(by_year=_lake_months()),
        jrc=WaterHistory(
            occurrence_core_pct=46,
            occurrence_area_pct=28,
            transition_core="lost_seasonal",
            years_water_core=[2009, 2010, 2015, 2017],
        ),
        monsoon=Monsoon(
            wet_months=[6, 7, 8, 9, 10, 11],
            seen=[2017, 2020, 2021, 2022],
            observed_years=9,
            obs_per_year={str(y): n for y, n in zip(range(2017, 2026), [6, 4, 3, 5, 4, 6, 3, 5, 4])},
        ),
        terrain=Terrain(
            plot_elevation_m=879.2,
            relative_height_500m_m=-2.8,
            relative_height_2km_m=-5.4,
            lower_than_500m_pct=86,
            lower_than_2km_pct=79,
            hand_m=2.4,
        ),
        vision=[
            VisionObs(year=2017, water_visible=True, construction_stage="none",
                      notes=["Open water covers the north half of the circle"]),
            VisionObs(year=2021, water_visible=False, construction_stage="roads",
                      notes=["Water area filled; road grid laid out"]),
            VisionObs(year=2025, water_visible=False, construction_stage="dense",
                      notes=["Dense housing across the former water area"]),
        ],
        rain=_rain(3.0, 212),
        embedding=EmbeddingChange(change=0.57, biggest_change_year=2019),
    )


def _farm_landcover() -> dict[str, LandcoverYear]:
    """Farmland laid out as plots from 2018: crops give way to houses, tree cover stays put."""
    out = {}
    for y in range(2016, 2026):
        t = min(1.0, max(0.0, (y - 2017) / 7))  # 0 before 2018, 1 by 2024
        built = round(0.14 + 0.40 * t, 3)
        bare = round(0.06 + 0.08 * (1 - abs(2 * t - 1)), 3)  # cleared plots peak mid-build
        crops = round(1 - 0.2 - 0.1 - 0.08 - built - bare, 3)
        out[str(y)] = LandcoverYear(trees=0.2, grass=0.1, shrub_and_scrub=0.08, crops=crops, built=built, bare=bare)
    return out


def _farm_pond_years() -> dict[str, float]:
    """A small farm pond (2-4% of the area) that held water most years until the layout came in."""
    out = {}
    for y in range(1984, 2022):
        base = 0.03 if y < 2017 else max(0.0, 0.03 - (y - 2016) * 0.008)
        wiggle = 0.012 * ((y * 7) % 5 - 2) / 2
        out[str(y)] = round(max(0.0, base + wiggle), 3)
    return out


def _farm_pond_months() -> dict[str, list[float | None]]:
    """Monsoon-only puddling in the farm pond; dry the rest of the year, gone after 2019."""
    out: dict[str, list[float | None]] = {}
    for y in range(1984, 2026):
        fill = 1.0 if y < 2017 else max(0.0, 1 - (y - 2016) / 3)
        wet_year = 0.6 + 0.4 * (((y * 7) % 5) / 4)
        months: list[float | None] = []
        for m in range(1, 13):
            season = {7: .5, 8: .9, 9: 1.0, 10: .6, 11: .2}.get(m, 0.0)
            v = round(0.05 * season * fill * wet_year, 3)
            cloudy = m in (7, 8) and (y * 5 + m) % 6 == 0
            months.append(None if cloudy else v)
        out[str(y)] = months
    return out


def high_ground_control() -> Evidence:
    """Low-risk story: farmland on higher ground that became a plotted layout. Small farm pond, no floods."""
    return Evidence(
        landcover=Landcover(by_year=_farm_landcover()),
        jrc=WaterHistory(occurrence_core_pct=0, occurrence_area_pct=3, transition_core=None),
        water_years=WaterYears(by_year=_farm_pond_years()),
        water_months=WaterMonths(by_year=_farm_pond_months()),
        monsoon=Monsoon(wet_months=[6, 7, 8, 9, 10, 11], seen=[], observed_years=9),
        terrain=Terrain(
            plot_elevation_m=934.0,
            relative_height_500m_m=4.5,
            relative_height_2km_m=12.0,
            lower_than_500m_pct=8,
            lower_than_2km_pct=12,
            hand_m=24.0,
        ),
        vision=[
            VisionObs(year=2017, water_visible=False, construction_stage="none"),
            VisionObs(year=2021, water_visible=False, construction_stage="partial"),
            VisionObs(year=2025, water_visible=False, construction_stage="dense"),
        ],
        rain=_rain(3.0, 198),
        embedding=EmbeddingChange(change=0.38, biggest_change_year=2020),
    )


def mid_slope_moderate() -> Evidence:
    years = {str(y): _lc(0.01, 0.2, 0.2, 0.35 + (y - 2016) * 0.012, 0.12) for y in range(2016, 2026)}
    return Evidence(
        landcover=Landcover(by_year=years),
        jrc=WaterHistory(occurrence_core_pct=0, occurrence_area_pct=6, transition_core=None),
        water_years=WaterYears(by_year={str(y): (0.02 if y % 4 == 0 else 0.0) for y in range(1984, 2022)}),
        monsoon=Monsoon(wet_months=[6, 7, 8, 9, 10, 11], seen=[2022], observed_years=9),
        terrain=Terrain(
            plot_elevation_m=901.0,
            relative_height_500m_m=-0.8,
            relative_height_2km_m=-1.4,
            lower_than_500m_pct=55,
            lower_than_2km_pct=48,
            hand_m=7.5,
        ),
        rain=_rain(3.0, 205),
        embedding=EmbeddingChange(change=0.21, biggest_change_year=2020),
    )


# Drill-down results: only reached when the agent (or default policy) investigates further.
MOCK_FLOOD_EVENTS = {
    "former_lake": S1Flood(event="2022-09-05", flooded_fraction_aoi=0.18),
}

MOCK_NEWS = {
    "former_lake": [
        NewsItem(date="2022-09", title="(illustrative) Waterlogging reported in east-side layouts",
                 url="https://example.com/news-1"),
        NewsItem(date="2022-09", title="(illustrative) Residents evacuated after heavy rain",
                 url="https://example.com/news-2"),
    ],
}

MOCK_SCENARIOS = {
    "former_lake": former_lake_layout,
    "high_ground": high_ground_control,
    "moderate": mid_slope_moderate,
}
