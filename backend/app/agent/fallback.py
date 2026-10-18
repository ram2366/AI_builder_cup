"""Template-based findings and verdict.

Used when the Gemini agent is disabled or fails, so a report is always produced. It is also the
reference for what a correct, fully cited finding looks like.
"""

from datetime import date

from app.rules import overall_level
from app.schemas import Dimension, DimensionRating, Evidence, Finding, Level, Verdict

_SEVERITY = {"high": "concern", "elevated": "concern", "moderate": "watch", "low": "info"}

DIMENSION_LABEL: dict[Dimension, str] = {
    "water_body": "Former water body",
    "flood": "Flooding & waterlogging",
    "terrain": "Low-lying terrain",
    "green": "Green cover loss",
    "land_health": "Land health",
    "rain": "Heavy-rain exposure (regional)",
}

LIMITATIONS = [
    "Describes the past; it does not predict future events.",
    "FABDEM is a 30 m terrain model, not a site survey; MERIT HAND is retained only as 90 m regional drainage context.",
    "Open Buildings covers 2016-2023 in supported regions; first detection is not an exact construction date and small buildings can be missed.",
    "The Global Flood Database covers mapped events from 2000-2018 at roughly 250 m effective resolution and can miss local or unmapped floods.",
    "WRI Aqueduct is a 1 km regional screening model, not property-level inundation mapping or a forecast.",
    "Wet-season months are the six wettest in 2015-2024 CHIRPS climatology at about 5.5 km; cloudy satellite scenes and local drainage can differ.",
    "Other satellite evidence is 10-30 m resolution and can miss very local conditions.",
    "Does not check legal title, approvals or construction quality.",
]


def _pct(x: float) -> str:
    return f"{x * 100:.0f}%"


def _nice_date(iso: str) -> str:
    try:
        d = date.fromisoformat(iso)
        return f"{d.day} {d.strftime('%b')} {d.year}"
    except ValueError:
        return iso


def build_findings(ev: Evidence, ratings: dict[Dimension, DimensionRating]) -> list[Finding]:
    out: list[Finding] = []

    def add(dim: Dimension, claim: str, refs: list[str]) -> None:
        level = ratings[dim].level if dim in ratings else "low"
        out.append(
            Finding(
                id=f"f{len(out) + 1}",
                dimension=dim,
                claim=claim,
                evidence_refs=refs,
                severity=_SEVERITY[level],  # type: ignore[arg-type]
            )
        )

    if ev.jrc:
        j = ev.jrc
        if j.occurrence_core_pct >= 1:
            add(
                "water_body",
                f"Surface water was detected on the plot in {j.occurrence_core_pct:.0f}% of "
                f"satellite observations ({j.period}).",
                ["jrc.occurrence_core_pct", "jrc.period"],
            )
        if j.transition_core in ("lost_seasonal", "lost_permanent"):
            kind = "seasonal" if j.transition_core == "lost_seasonal" else "permanent"
            add(
                "water_body",
                f"The plot is classified as a place that lost {kind} water during {j.period}: "
                "water used to be here and is no longer.",
                ["jrc.transition_core", "jrc.period"],
            )

    early = [v for v in ev.vision if v.water_visible]
    if early:
        idx = ev.vision.index(early[0])
        add(
            "water_body",
            f"Open water is visible inside the circle in the {early[0].year} satellite image.",
            [f"vision.{idx}.year", f"vision.{idx}.water_visible"],
        )

    if ev.monsoon:
        m = ev.monsoon
        if m.seen:
            years = ", ".join(str(y) for y in m.seen)
            add(
                "flood",
                f"Wet-season water was seen in {len(m.seen)} of the {m.observed_years} years "
                f"observed ({years}).",
                ["monsoon.seen", "monsoon.observed_years"],
            )
    if ev.s1 and ev.s1.flooded_fraction_aoi >= 0.03:
        add(
            "flood",
            f"Radar images show about {_pct(ev.s1.flooded_fraction_aoi)} of the area under "
            f"water on {_nice_date(ev.s1.event)}.",
            ["s1.flooded_fraction_aoi", "s1.event"],
        )
    if ev.news:
        dates = ", ".join(sorted({n.date for n in ev.news}))
        add(
            "flood",
            f"{len(ev.news)} local news report(s) mention flooding or waterlogging nearby ({dates}).",
            ["news"],
        )

    if ev.historic_floods and ev.historic_floods.events:
        h = ev.historic_floods
        add(
            "flood",
            f"The Global Flood Database maps {len(h.events)} historic flood event(s) crossing this area; "
            f"the largest mapped share was {_pct(h.max_flooded_fraction)} during {h.period}.",
            ["historic_floods.events", "historic_floods.max_flooded_fraction", "historic_floods.period"],
        )
    if ev.flood_hazard and ev.flood_hazard.exposed_fraction >= 0.10 and ev.flood_hazard.inundation_depth_max_m >= 0.25:
        h = ev.flood_hazard
        add(
            "flood",
            f"WRI's regional {h.return_period_years}-year riverine baseline maps water over "
            f"{_pct(h.exposed_fraction)} of this area, reaching {h.inundation_depth_max_m:.2f} m in the model.",
            [
                "flood_hazard.return_period_years",
                "flood_hazard.exposed_fraction",
                "flood_hazard.inundation_depth_max_m",
            ],
        )

    if ev.terrain:
        t = ev.terrain
        add(
            "terrain",
            f"FABDEM places the plot {t.relative_height_500m_m:.1f} m relative to the {t.local_compare_radius_m} m neighbourhood median "
            f"and lower than {t.lower_than_500m_pct:.0f}% of that surrounding land.",
            ["terrain.relative_height_500m_m", "terrain.local_compare_radius_m", "terrain.lower_than_500m_pct"],
        )

    if ev.buildings and ev.buildings.first_detected_year is not None:
        b = ev.buildings
        if b.strongest_growth_year is not None:
            timing = f"; the strongest mapped count increase was in {b.strongest_growth_year}"
            refs = ["buildings.first_detected_year", "buildings.strongest_growth_year"]
        else:
            timing = ""
            refs = ["buildings.first_detected_year"]
        prefix = "Buildings were already detected by" if b.first_detected_year == 2016 else "Buildings were first detected in"
        add(
            "green",
            f"{prefix} {b.first_detected_year} in Open Buildings{timing}; this is detection timing, not an exact construction date.",
            refs,
        )

    if ev.landcover and len(ev.landcover.by_year) >= 2:
        windows = ev.landcover.comparison_windows
        baseline, recent = windows["baseline"], windows["recent"]
        add(
            "green",
            f"Tree, grass and shrub cover went from {_pct(baseline.green)} in {baseline.period} to {_pct(recent.green)} "
            f"in {recent.period}, while built-up land went from {_pct(baseline.mean.built)} to "
            f"{_pct(recent.mean.built)}.",
            [
                "landcover.comparison_windows.baseline.period",
                "landcover.comparison_windows.baseline.green",
                "landcover.comparison_windows.baseline.mean.built",
                "landcover.comparison_windows.recent.period",
                "landcover.comparison_windows.recent.green",
                "landcover.comparison_windows.recent.mean.built",
            ],
        )

    if ev.embedding and ev.embedding.change >= 0.3:
        e = ev.embedding
        add(
            "green",
            f"Google DeepMind's AlphaEarth model rates this spot as heavily changed over {e.period} "
            f"(change score {e.change:.2f}; higher means more change).",
            ["embedding.change", "embedding.period"],
        )

    if ev.land_health and ratings.get("land_health") and ratings["land_health"].level != "low":
        h = ev.land_health
        ndvi = h.trends.get("ndvi")
        if ndvi and ndvi.significant and ndvi.slope_per_year <= -0.02 and h.ndvi_change is not None and h.ndvi_change <= -0.1:
            add(
                "land_health",
                f"NDVI changed by {ndvi.slope_per_year:.3f} per year across {ndvi.n_years} years "
                f"(p {ndvi.p_value:.3f}); the two-year-window change was {h.ndvi_change:.3f}.",
                [
                    "land_health.trends.ndvi.slope_per_year",
                    "land_health.trends.ndvi.n_years",
                    "land_health.trends.ndvi.p_value",
                    "land_health.ndvi_change",
                ],
            )
        elif h.context.lst_may_delta_c is not None and h.context.lst_may_delta_c >= 3:
            add(
                "land_health",
                f"May land-surface temperature was {h.context.lst_may_delta_c:.1f} °C above the "
                f"median within {h.context.compare_radius_km:.0f} km.",
                ["land_health.context.lst_may_delta_c", "land_health.context.compare_radius_km"],
            )

    if ev.rain:
        add(
            "rain",
            f"Regional rainfall records show on average {ev.rain.heavy_days_per_year_avg:.1f} "
            "very heavy rain days per year. This applies to the whole surrounding region.",
            ["rain.heavy_days_per_year_avg"],
        )
    return out


_HEADLINES: dict[Dimension, str] = {
    "water_body": "This spot appears to be on or next to a former water body",
    "flood": "This area has a history of wet-season flooding or waterlogging",
    "terrain": "This plot is low-lying compared with its surroundings",
    "green": "This area has lost much of its green cover",
    "land_health": "Satellite records show declining land health",
}

_CHECK_NEXT: dict[Dimension, list[str]] = {
    "water_body": [
        "Ask the developer how the former water area was filled and compacted.",
        "Check the official lake and drain (buffer zone) maps of your city authority.",
    ],
    "flood": [
        "Visit the site during or just after heavy rain.",
        "Ask neighbours and local shops about waterlogging in recent wet seasons.",
        "Ask for the layout's stormwater drainage plan.",
    ],
    "terrain": ["Compare the plot level with the road and neighbouring plots."],
    "green": ["Check planned green spaces in the approved layout plan."],
    "land_health": ["Compare current vegetation and shade with the approved site plan."],
}


def build_verdict(ev: Evidence, ratings: dict[Dimension, DimensionRating]) -> Verdict:
    overall: Level = overall_level(ratings)
    concerns = [d for d, r in ratings.items() if d != "rain" and r.level in ("high", "elevated")]
    order = ["water_body", "flood", "terrain", "land_health", "green"]
    concerns.sort(key=order.index)

    if concerns:
        headline = _HEADLINES[concerns[0]]
        named = ", ".join(DIMENSION_LABEL[d].lower() for d in concerns)
        summary = (
            f"Satellite records point to elevated physical risk here ({named}). "
            "Each finding below links to the evidence behind it."
        )
    elif overall == "moderate":
        headline = "Some signals worth checking, nothing severe in the records"
        summary = "The records show moderate signals only. Review the findings below before deciding."
    else:
        headline = "No major water or flood history found in the satellite records"
        summary = (
            "We found no strong signs of past water bodies, flooding or low-lying terrain. "
            "Satellite data has limits, so still do a site visit."
        )

    check_next: list[str] = []
    for d in concerns:
        check_next += _CHECK_NEXT.get(d, [])
    check_next.append("Verify title, approvals and RERA registration through official records.")
    return Verdict(
        overall=overall,
        headline=headline,
        summary=summary,
        check_next=check_next,
        limitations=LIMITATIONS,
    )
