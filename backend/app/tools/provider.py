"""Evidence providers.

`collect` is the fast parallel fan-out every report gets. `drilldowns` are follow-up investigations
the agent can choose to run (or the template pipeline runs by default policy)."""

import math
import time
from collections.abc import Callable
from typing import Protocol

from app.config import get_settings
from app.schemas import Evidence, LandcoverYear, NewsItem, ReportRequest, S1Flood
from app.tools import mock

ProgressFn = Callable[[str, str], None]


class Drilldowns(Protocol):
    def water_by_year(self, year: int) -> dict: ...
    def radar_flood_check(self, start: str, end: str) -> S1Flood | None: ...
    def landcover_detail(self, year: int) -> LandcoverYear | None: ...
    def local_news(self, place: str) -> list[NewsItem]: ...


class EvidenceProvider(Protocol):
    def collect(self, req: ReportRequest, progress: ProgressFn) -> Evidence: ...
    def drilldowns(self, req: ReportRequest, evidence: Evidence) -> Drilldowns: ...
    def quick(self, lat: float, lng: float, radius_m: int) -> Evidence:
        """Cheap evidence subset (water, wet-season signal, terrain) for scanning nearby points."""
        ...


class MockProvider:
    """Deterministic scenario per location so the UI and agent can be built offline."""

    STEPS = [
        ("landcover", "Land cover 2016-2025 (Dynamic World, 10 m)"),
        ("water", "Water history and location-specific wet-season scenes"),
        ("terrain", "Plot terrain (FABDEM 30 m) and regional drainage context"),
        ("images", "Satellite images 2017-2025 (Sentinel-2)"),
        ("change", "Change score (AlphaEarth embeddings)"),
    ]

    def __init__(self, delay_s: float) -> None:
        self.delay_s = delay_s

    def collect(self, req: ReportRequest, progress: ProgressFn) -> Evidence:
        for step, msg in self.STEPS:
            time.sleep(self.delay_s)
            progress(step, msg)
        return mock.MOCK_SCENARIOS[_scenario(req)]()

    def drilldowns(self, req: ReportRequest, evidence: Evidence) -> Drilldowns:
        return MockDrilldowns(_scenario(req), evidence, self.delay_s)

    def quick(self, lat: float, lng: float, radius_m: int) -> Evidence:
        # Mixed neighbourhood so the alternatives scan finds a realistic spread.
        h = int(abs(math.floor(lat * 1000) * 31 + math.floor(lng * 1000) * 17)) % 5
        scenario = ["former_lake", "moderate", "high_ground", "moderate", "former_lake"][h]
        ev = mock.MOCK_SCENARIOS[scenario]()
        return Evidence(jrc=ev.jrc, monsoon=ev.monsoon, terrain=ev.terrain)


class MockDrilldowns:
    def __init__(self, scenario: str, evidence: Evidence, delay_s: float) -> None:
        self.scenario = scenario
        self.evidence = evidence
        self.delay_s = delay_s

    def water_by_year(self, year: int) -> dict:
        m = self.evidence.monsoon
        if m is None:
            return {"year": year, "available": False}
        return {
            "year": year,
            "wet_months": m.wet_months,
            "wet_season_observations": m.obs_per_year.get(str(year), 0),
            "water_seen": year in m.seen,
        }

    def radar_flood_check(self, start: str, end: str) -> S1Flood | None:
        time.sleep(self.delay_s)
        event = mock.MOCK_FLOOD_EVENTS.get(self.scenario)
        if event and start <= event.event <= end:
            return event
        return S1Flood(event=end, flooded_fraction_aoi=0.0)

    def landcover_detail(self, year: int) -> LandcoverYear | None:
        lc = self.evidence.landcover
        return lc.by_year.get(str(year)) if lc else None

    def local_news(self, place: str) -> list[NewsItem]:
        time.sleep(self.delay_s)
        return list(mock.MOCK_NEWS.get(self.scenario, []))


def _scenario(req: ReportRequest) -> str:
    # Stable pseudo-random split so different pins show different mock outcomes.
    control = int(abs(math.floor(req.lat * 1000) + math.floor(req.lng * 1000))) % 3 == 0
    return "high_ground" if control else "former_lake"


def get_provider() -> EvidenceProvider:
    kind = get_settings().evidence_provider
    if kind == "mock":
        return MockProvider(get_settings().mock_delay_s)
    if kind == "earthengine":
        from app.tools.earthengine import EarthEngineProvider

        return EarthEngineProvider()
    raise ValueError(f"Unknown evidence provider '{kind}'")
