"""Locality lens: real nearby places (Google Places, OpenStreetMap backup), a transparent score built
only from distances and counts, and grounded resident opinions shown alongside (never scored)."""

import time
import uuid
from concurrent.futures import ThreadPoolExecutor

from app.locality.amenities import AmenitiesUnavailable, fetch_amenities
from app.locality.scoring import calculate_scores
from app.locality.sentiment import analyze_sentiment
from app.schemas import AmenitySummary, LocalityReport, SubIndexScore

__all__ = ["AmenitiesUnavailable", "get_locality_report"]

_CACHE: dict[str, tuple[float, LocalityReport]] = {}
_TTL_S = 24 * 3600


def _headline(score: int, subs: dict[str, SubIndexScore]) -> str:
    # The address is already the title above; the headline only states the finding.
    weakest = min(subs.values(), key=lambda s: s.score).name.lower()
    if score >= 85:
        return "Very well served: daily needs, schools and transit are close by"
    if score >= 70:
        return f"Well served, with {weakest} the weakest spot"
    if score >= 50:
        return f"Partly served; {weakest} needs planning"
    return "Thinly served; expect to drive for most daily needs"


def _summary(a: AmenitySummary, radius_m: int) -> str:
    def near(p, what: str) -> str:
        return f"{what} {p.distance_m} m away" if p else f"no {what} within {radius_m / 1000:.1f} km"

    return (
        f"Within {radius_m / 1000:.1f} km ({a.source}): {near(a.nearest_metro, 'metro')}, "
        f"{near(a.nearest_grocery, 'grocery')}, {near(a.nearest_hospital, 'healthcare')} and "
        f"{near(a.nearest_school, 'school')}."
    )


def get_locality_report(lat: float, lng: float, label: str = "Selected location", radius_m: int = 2500) -> LocalityReport:
    key = f"{round(lat, 4)}_{round(lng, 4)}_{radius_m}"
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL_S:
        return hit[1]

    with ThreadPoolExecutor(max_workers=2) as pool:
        amen_f = pool.submit(fetch_amenities, lat, lng, radius_m)
        sent_f = pool.submit(analyze_sentiment, label, lat, lng)
        amenities = amen_f.result()  # raises AmenitiesUnavailable: the API turns it into a clear error
        sentiment = sent_f.result()

    overall, subs = calculate_scores(amenities)
    report = LocalityReport(
        id=f"loc_{uuid.uuid4().hex[:10]}",
        lat=lat,
        lng=lng,
        label=label,
        radius_m=radius_m,
        overall_score=overall,
        verdict_headline=_headline(overall, subs),
        verdict_summary=_summary(amenities, radius_m),
        sub_indices=subs,
        amenities=amenities,
        sentiment=sentiment,
        created_at=time.time(),
    )
    _CACHE[key] = (time.time(), report)
    return report
