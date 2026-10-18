"""The data contract shared by the evidence engine, the agent, the API and the frontend.

Every evidence value is addressable by a dotted path (e.g. "jrc.occurrence_core_pct").
Findings cite those paths in `evidence_refs`, and the verifier resolves them.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.geometry import boundary_area_m2, normalize_polygon_coordinates

Level = Literal["low", "moderate", "elevated", "high"]
Dimension = Literal["water_body", "flood", "terrain", "green", "land_health", "rain"]
Confidence = Literal["high", "medium", "low"]
Lang = Literal["en", "hi", "kn"]
Status = Literal["queued", "evidence", "investigating", "verifying", "done", "partial", "error"]

LEVEL_ORDER: list[Level] = ["low", "moderate", "elevated", "high"]
DIMENSIONS: list[Dimension] = ["water_body", "flood", "terrain", "green", "land_health", "rain"]


# ---------- request ----------

class GeoJSONPolygon(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]]

    @field_validator("coordinates", mode="before")
    @classmethod
    def validate_coordinates(cls, value: object) -> list[list[tuple[float, float]]]:
        return normalize_polygon_coordinates(value)

    @computed_field
    @property
    def area_m2(self) -> float:
        return round(boundary_area_m2(self.coordinates), 1)

class ReportRequest(BaseModel):
    lat: float = Field(ge=-60, le=75)
    lng: float = Field(ge=-180, le=180)
    radius_m: int = Field(default=250, ge=100, le=1000)
    lang: Lang = "en"
    report_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    label: str | None = Field(default=None, max_length=120)
    geometry: GeoJSONPolygon | None = None


# ---------- evidence ----------

class LandcoverYear(BaseModel):
    water: float = 0
    trees: float = 0
    grass: float = 0
    flooded_vegetation: float = 0
    crops: float = 0
    shrub_and_scrub: float = 0
    built: float = 0
    bare: float = 0
    snow_and_ice: float = 0


class LandcoverWindow(BaseModel):
    period: str
    mean: LandcoverYear

    @computed_field
    @property
    def green(self) -> float:
        return round(self.mean.trees + self.mean.grass + self.mean.shrub_and_scrub, 3)


class Landcover(BaseModel):
    source: str = "Dynamic World annual mean class probabilities (GOOGLE/DYNAMICWORLD/V1)"
    resolution_m: int = 10
    by_year: dict[str, LandcoverYear]

    @computed_field
    @property
    def green_by_year(self) -> dict[str, float]:
        """Trees + grass + shrub share per year, so claims about 'green cover' can cite one value."""
        return {
            y: round(c.trees + c.grass + c.shrub_and_scrub, 3) for y, c in self.by_year.items()
        }

    @computed_field
    @property
    def comparison_windows(self) -> dict[str, LandcoverWindow]:
        """Equal-weight means for the first and latest two available annual probability composites."""
        years = sorted(self.by_year)
        if len(years) < 2:
            return {}

        def window(selected: list[str]) -> LandcoverWindow:
            mean = {
                name: round(sum(getattr(self.by_year[year], name) for year in selected) / len(selected), 3)
                for name in LandcoverYear.model_fields
            }
            return LandcoverWindow(period=f"{selected[0]}–{selected[-1]}", mean=LandcoverYear(**mean))

        return {"baseline": window(years[:2]), "recent": window(years[-2:])}


class WaterHistory(BaseModel):
    source: str = "JRC Global Surface Water v1.4"
    resolution_m: int = 30
    period: str = "1984-2021"
    occurrence_core_pct: float
    occurrence_area_pct: float
    transition_core: str | None = None
    years_water_core: list[int] = []


class Monsoon(BaseModel):
    source: str = "Dynamic World, location-specific wet-season scenes"
    resolution_m: int = 10
    wet_months: list[int]
    season_basis: str = "Six wettest months from CHIRPS 2015-2024 climatology"
    seen: list[int]
    observed_years: int
    obs_per_year: dict[str, int] = {}


class Terrain(BaseModel):
    source: str = "FABDEM bare-earth elevation"
    resolution_m: int = 30
    plot_elevation_m: float
    relative_height_500m_m: float
    relative_height_2km_m: float
    lower_than_500m_pct: float
    lower_than_2km_pct: float
    local_compare_radius_m: int = 500
    drainage_source: str = "MERIT Hydro HAND"
    drainage_resolution_m: int = 90
    hand_m: float
    compare_radius_km: float = 2

    @computed_field
    @property
    def lower_than_pct(self) -> float:
        """Compatibility path used by older clients; the value now comes from 30 m FABDEM."""
        return self.lower_than_2km_pct


class BuildingYear(BaseModel):
    presence_max: float
    estimated_count: float
    mean_height_m: float | None = None


class BuildingHistory(BaseModel):
    source: str = "Google Open Buildings 2.5D Temporal V1"
    resolution_m: int = 4
    period: str = "2016-2023"
    by_year: dict[str, BuildingYear]
    first_detected_year: int | None = None
    strongest_growth_year: int | None = None


class HistoricFloodEvent(BaseModel):
    event_id: int
    year: int
    flooded_fraction: float


class HistoricFloods(BaseModel):
    source: str = "Global Flood Database v1 (MODIS events)"
    resolution_m: int = 250
    period: str = "2000-2018"
    events: list[HistoricFloodEvent] = []
    max_flooded_fraction: float = 0
    latest_event_year: int | None = None


class FloodHazard(BaseModel):
    source: str = "WRI Aqueduct Floods Hazard Maps Version 2"
    resolution_m: int = 1000
    period: str = "historical baseline (model year 1980)"
    return_period_years: int = 100
    exposed_fraction: float
    inundation_depth_mean_m: float
    inundation_depth_max_m: float


class S1Flood(BaseModel):
    source: str = "Sentinel-1 SAR change detection"
    resolution_m: int = 10
    event: str
    flooded_fraction_aoi: float


class SatImage(BaseModel):
    year: int
    url: str


class VisionObs(BaseModel):
    year: int
    water_visible: bool
    construction_stage: Literal["none", "roads", "partial", "dense"]
    notes: list[str] = []


class Rain(BaseModel):
    source: str = "CHIRPS daily (~5.5 km, regional)"
    resolution_m: int = 5500
    climatology_period: str = "2015-2024"
    monthly_climatology_mm: dict[str, float]
    wet_months: list[int]
    heavy_days_per_year_avg: float
    max_3day_mm: float


class EmbeddingChange(BaseModel):
    source: str = "AlphaEarth Satellite Embedding (GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL)"
    resolution_m: int = 10
    period: str = "2017-2024"
    change: float
    biggest_change_year: int | None = None


class TrendResult(BaseModel):
    slope_per_year: float
    p_value: float
    significant: bool
    n_years: int


class LandHealthYear(BaseModel):
    ndvi_median: float | None = None
    ndvi_p10: float | None = None
    ndvi_p90: float | None = None
    mndwi_median: float | None = None
    ndmi_median: float | None = None
    ndmi_dry: float | None = None
    ndmi_wet: float | None = None
    ndbi_median: float | None = None
    lst_may_c: float | None = None
    observations_s2: int = 0
    observations_lst: int = 0


class LandHealthContext(BaseModel):
    compare_radius_km: float = 2
    ndvi_percentile: float | None = None
    lst_may_delta_c: float | None = None


class LandHealth(BaseModel):
    source: str = "Sentinel-2 SR Harmonized + Cloud Score+ (cs_cdf ≥ 0.6)"
    resolution_m: int = 10
    lst_source: str = "Landsat 8/9 Collection 2 Level 2 ST_B10"
    lst_resolution_m: int = 30
    period: str = "2017-present"
    by_year: dict[str, LandHealthYear]
    monthly_ndvi_climatology: dict[str, float] = {}
    trends: dict[str, TrendResult] = {}
    context: LandHealthContext = LandHealthContext()

    @computed_field
    @property
    def ndvi_change(self) -> float | None:
        """Latest two-year mean minus the first two-year mean, using available annual medians."""
        values = [(year, row.ndvi_median) for year, row in sorted(self.by_year.items()) if row.ndvi_median is not None]
        if len(values) < 2:
            return None
        width = min(2, len(values) // 2)
        baseline = sum(value for _, value in values[:width]) / width
        recent = sum(value for _, value in values[-width:]) / width
        return round(recent - baseline, 3)


class NewsItem(BaseModel):
    date: str
    title: str
    url: str


class WaterYears(BaseModel):
    """Share of the area covered by water each year (JRC YearlyHistory), for the 40-year timeline."""

    source: str = "JRC Global Surface Water YearlyHistory"
    resolution_m: int = 30
    by_year: dict[str, float]


class WaterMonths(BaseModel):
    """Monthly water share inside the area (JRC MonthlyHistory to 2021, radar/Dynamic World after).
    Each year maps to 12 values (Jan..Dec); None means no clear observation that month."""

    source: str = "JRC Global Surface Water MonthlyHistory + Sentinel-1"
    resolution_m: int = 30
    by_year: dict[str, list[float | None]]


class Evidence(BaseModel):
    landcover: Landcover | None = None
    land_health: LandHealth | None = None
    water_months: WaterMonths | None = None
    jrc: WaterHistory | None = None
    water_years: WaterYears | None = None
    monsoon: Monsoon | None = None
    terrain: Terrain | None = None
    buildings: BuildingHistory | None = None
    historic_floods: HistoricFloods | None = None
    flood_hazard: FloodHazard | None = None
    s1: S1Flood | None = None
    images: list[SatImage] = []
    vision: list[VisionObs] = []
    rain: Rain | None = None
    embedding: EmbeddingChange | None = None
    news: list[NewsItem] = []
    unavailable: list[str] = []


# ---------- interpretation ----------

class DimensionRating(BaseModel):
    level: Level
    confidence: Confidence
    sources: list[str] = []


class RatingChange(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    dimension: Dimension
    from_level: Level = Field(alias="from")
    to: Level
    because: list[str]


class Finding(BaseModel):
    id: str
    dimension: Dimension
    claim: str
    evidence_refs: list[str]
    severity: Literal["info", "watch", "concern"]
    confidence: Confidence = "medium"
    rating_change: RatingChange | None = None


class Verdict(BaseModel):
    overall: Level
    headline: str
    summary: str
    check_next: list[str] = []
    limitations: list[str] = []


class VerifierStats(BaseModel):
    checked: int = 0
    passed: int = 0
    fixed: int = 0
    dropped: int = 0
    issues: list[str] = []


class ProgressStep(BaseModel):
    step: str
    msg: str
    ts: float


class Location(BaseModel):
    lat: float
    lng: float
    label: str | None = None
    geometry: GeoJSONPolygon | None = None


class Translation(BaseModel):
    headline: str
    summary: str
    check_next: list[str] = []
    findings: dict[str, str] = {}  # finding id -> translated claim


class ActionItem(BaseModel):
    text: str
    why: str
    evidence_refs: list[str] = []


class ActionKit(BaseModel):
    checklist: list[ActionItem]
    builder_questions: list[ActionItem]
    share_text: str
    generated_by: Literal["gemini", "template"] = "template"


class Report(BaseModel):
    id: str
    status: Status
    location: Location
    radius_m: int
    lang: Lang
    progress: list[ProgressStep] = []
    evidence: Evidence | None = None
    ratings: dict[Dimension, DimensionRating] = {}
    findings: list[Finding] = []
    verdict: Verdict | None = None
    verifier: VerifierStats | None = None
    versions: dict[str, str] = {}
    evidence_sha256: str | None = None
    translations: dict[Lang, Translation] = {}
    actions: ActionKit | None = None
    error: str | None = None
    created_at: float


# ---------- follow-ups ----------

class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    lang: Lang = "en"


class AskResponse(BaseModel):
    answer: str
    evidence_refs: list[str] = []
    refused: bool = False


ClaimVerdict = Literal["supported", "contradicted", "partly", "not_verifiable"]


class ClaimCheck(BaseModel):
    text: str
    category: Literal["flood", "water_body", "green", "elevation", "other"]
    verdict: ClaimVerdict
    reason: str
    evidence_refs: list[str] = []


class BrochureResponse(BaseModel):
    claims: list[ClaimCheck]


class Alternative(BaseModel):
    lat: float
    lng: float
    distance_km: float
    bearing: str
    overall: Level
    ratings: dict[Dimension, Level]
    highlights: list[str]


class AlternativesResponse(BaseModel):
    origin_overall: Level
    alternatives: list[Alternative]
    scanned: int
    illustrative: bool


class CompareRequest(BaseModel):
    report_ids: list[str] = Field(min_length=2, max_length=3)


class CompareResponse(BaseModel):
    summary: str
    best_id: str | None
    generated_by: Literal["gemini", "template"] = "template"


# ---------- locality & liveability ----------

POICategory = Literal["transit", "education", "grocery", "healthcare", "social", "green"]


class POIItem(BaseModel):
    id: str
    name: str
    category: POICategory
    distance_m: int
    lat: float
    lng: float
    detail: str | None = None
    rating: float | None = None
    ratings: int | None = None
    maps_uri: str | None = None


class AmenitySummary(BaseModel):
    # "Google Places" or "OpenStreetMap"; empty when no source answered (nothing is ever invented).
    source: str = ""
    nearest_metro: POIItem | None = None
    nearest_bus: POIItem | None = None
    nearest_grocery: POIItem | None = None
    nearest_hospital: POIItem | None = None
    nearest_school: POIItem | None = None
    counts_by_category: dict[str, int] = {}
    pois: list[POIItem] = []


class WebSource(BaseModel):
    title: str
    url: str
    domain: str


class CommunitySentiment(BaseModel):
    """What people write about the area, from Gemini grounded on Google Search. Never scored."""

    available: bool = False
    summary: str = ""
    pros: list[str] = []
    cons: list[str] = []
    sources: list[WebSource] = []
    # Google's required "search suggestions" chip for grounded answers (HTML + CSS, rendered isolated).
    search_entry_html: str | None = None


class SubIndexScore(BaseModel):
    name: str
    score: int = Field(ge=0, le=100)
    weight: float
    status: Literal["excellent", "good", "moderate", "poor"]
    summary: str


class LocalityReport(BaseModel):
    id: str
    lat: float
    lng: float
    label: str
    radius_m: int = 2500
    overall_score: int = Field(ge=0, le=100)
    verdict_headline: str
    verdict_summary: str
    sub_indices: dict[str, SubIndexScore]
    amenities: AmenitySummary
    sentiment: CommunitySentiment
    created_at: float


CommuteKind = Literal["office", "school", "parents"]


class CommuteDestination(BaseModel):
    kind: CommuteKind
    label: str = Field(min_length=1, max_length=120)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class CommuteRequest(BaseModel):
    origin_lat: float = Field(ge=-90, le=90)
    origin_lng: float = Field(ge=-180, le=180)
    destinations: list[CommuteDestination] = Field(min_length=1, max_length=3)


class CommuteTrip(BaseModel):
    kind: CommuteKind
    label: str
    lat: float
    lng: float
    distance_km: float | None = None
    drive_peak_minutes: int | None = None
    drive_offpeak_minutes: int | None = None
    peak_gap_minutes: int | None = None
    transit_minutes: int | None = None
    drive_peak_condition: str | None = None
    drive_offpeak_condition: str | None = None
    transit_condition: str | None = None


class CommuteReport(BaseModel):
    source: Literal["Google Routes API"] = "Google Routes API"
    checked_at: str
    timezone: str
    peak_departure_local: str
    offpeak_departure_local: str
    trips: list[CommuteTrip]


class AirIndex(BaseModel):
    code: str
    display_name: str
    aqi: int | None = None
    aqi_display: str
    category: str
    dominant_pollutant: str | None = None


class AirPollutant(BaseModel):
    code: str
    display_name: str
    full_name: str
    concentration: float
    units: str


class AirHistoryDay(BaseModel):
    date: str
    aqi_mean: float
    aqi_max: int
    hours: int


class AirNo2History(BaseModel):
    source: str
    resolution_m: int
    period: str
    unit: Literal["µmol/m²"] = "µmol/m²"
    by_year: dict[str, float]
    trend: TrendResult | None = None


class AirQualityReport(BaseModel):
    source: Literal["Google Air Quality API"] = "Google Air Quality API"
    resolution_m: int = 500
    checked_at: str
    current_at: str
    timezone: str
    region_code: str | None = None
    index: AirIndex
    pollutants: list[AirPollutant]
    history_period: str
    history_daily: list[AirHistoryDay]
    no2: AirNo2History | None = None
    unavailable: list[str] = []


class NeighborhoodHealthYear(BaseModel):
    ndvi_median: float | None = None
    lst_may_c: float | None = None


class NeighborhoodHealth(BaseModel):
    source: str = "Sentinel-2 SR Harmonized + Cloud Score+ (cs_cdf ≥ 0.6)"
    resolution_m: int = 10
    lst_source: str = "Landsat 8/9 Collection 2 Level 2 ST_B10"
    lst_resolution_m: int = 30
    period: str
    radius_m: int = 1000
    compare_radius_km: int = 5
    by_year: dict[str, NeighborhoodHealthYear]
    recent_ndvi: float | None = None
    greener_than_surroundings_pct: float | None = None
    recent_lst_may_c: float | None = None
    lst_may_delta_c: float | None = None
    ndvi_trend: TrendResult | None = None
    lst_trend: TrendResult | None = None
