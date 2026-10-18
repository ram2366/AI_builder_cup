"""Neighbourhood-scale heat and green evidence, reused from the Land Health engine."""

from app.schemas import NeighborhoodHealth


class NeighborhoodHealthUnavailable(RuntimeError):
    pass


def get_neighborhood_health(lat: float, lng: float) -> NeighborhoodHealth:
    try:
        from app.tools.earthengine import neighborhood_health

        report = neighborhood_health(lat, lng)
    except Exception as exc:
        raise NeighborhoodHealthUnavailable("Neighbourhood heat and green evidence is unavailable right now") from exc
    if report is None:
        raise NeighborhoodHealthUnavailable("No neighbourhood heat and green observations were available")
    return report
