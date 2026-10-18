"""Real evidence from Google Earth Engine.

Every number here comes from a public dataset at the pinned location; nothing is filled in when a
query fails (the section is left empty and named in `Evidence.unavailable` instead). Results are
cached on disk per location so repeated reports cost no Earth Engine quota.

Areas: for a custom boundary, both `aoi` and `core` are the polygon itself. For the legacy circle,
`aoi` is the selected radius and `core` is the smaller plot centre used by existing reports.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import ee

from app.config import get_settings
from app.analytics import sen_mann_kendall
from app.geometry import boundary_hash
from app.schemas import (
    BuildingHistory,
    BuildingYear,
    EmbeddingChange,
    Evidence,
    FloodHazard,
    GeoJSONPolygon,
    HistoricFloodEvent,
    HistoricFloods,
    LandHealth,
    LandHealthContext,
    LandHealthYear,
    Landcover,
    LandcoverYear,
    Monsoon,
    NeighborhoodHealth,
    NeighborhoodHealthYear,
    NewsItem,
    Rain,
    ReportRequest,
    S1Flood,
    Terrain,
    WaterHistory,
    WaterMonths,
    WaterYears,
)

log = logging.getLogger(__name__)
ProgressFn = Callable[[str, str], None]

CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "ee"
CACHE_VERSION = "ee-v7"

LAST_FULL_YEAR = 2025  # Dynamic World / timeline end; keeps the UI's 1984-2025 axis
DW_CLASSES = ["water", "trees", "grass", "flooded_vegetation", "crops", "shrub_and_scrub", "built", "bare", "snow_and_ice"]
TRANSITIONS = {
    1: "permanent", 2: "new_permanent", 3: "lost_permanent", 4: "seasonal", 5: "new_seasonal",
    6: "lost_seasonal", 7: "seasonal_to_permanent", 8: "permanent_to_seasonal",
    9: "ephemeral_permanent", 10: "ephemeral_seasonal",
}
HEAVY_RAIN_MM = 64.5  # IMD "heavy rain" day

_init_lock = threading.Lock()
_initialised = False


def init() -> None:
    global _initialised
    with _init_lock:
        if not _initialised:
            # High-volume endpoint: built for many small parallel getInfo calls like ours.
            ee.Initialize(project=get_settings().gcp_project, opt_url="https://earthengine-highvolume.googleapis.com")
            _initialised = True


# ---------- cache ----------

def _key(*parts: Any) -> str:
    raw = json.dumps([CACHE_VERSION, *parts], sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _cached(name: str, key_parts: tuple, compute: Callable[[], Any]) -> Any:
    cache_key = f"{name}-{_key(*key_parts)}"
    if get_settings().store == "firestore":
        from app.services.store import get_firestore_client

        doc = get_firestore_client().collection("earth_engine_cache").document(cache_key)
        snapshot = doc.get()
        if snapshot.exists:
            return snapshot.to_dict()["value"]
        value = compute()
        doc.set({"value": value})
        return value

    path = CACHE_DIR / f"{cache_key}.json"
    if path.exists():
        return json.loads(path.read_text())
    value = compute()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))
    return value


# ---------- geometry ----------

def _areas(
    lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None
) -> tuple[ee.Geometry, ee.Geometry]:
    if geometry is not None:
        polygon = ee.Geometry.Polygon(geometry.coordinates)
        return polygon, polygon
    pt = ee.Geometry.Point([lng, lat])
    core_r = max(45, round(radius_m * 0.3))
    return pt.buffer(radius_m), pt.buffer(core_r)


def _clear(valid: float | None, total: float | None) -> bool:
    """At least half the area had a usable observation."""
    return bool(total) and (valid or 0) >= 0.5 * total


def _r(x: float | None, nd: int = 3) -> float:
    return round(float(x or 0.0), nd)


def _optional_r(x: float | None, nd: int = 3) -> float | None:
    return None if x is None else round(float(x), nd)


# ---------- individual queries (each returns plain JSON so it can be cached) ----------

def q_jrc(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> dict:
    aoi, core = _areas(lat, lng, radius_m, geometry)
    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    occ = gsw.select("occurrence").unmask(0)
    tr = gsw.select("transition").unmask(0)
    return ee.Dictionary({
        "core": occ.reduceRegion(ee.Reducer.mean(), core, 30).get("occurrence"),
        "area": occ.reduceRegion(ee.Reducer.mean(), aoi, 30).get("occurrence"),
        "transition": tr.reduceRegion(ee.Reducer.mode(), core, 30).get("transition"),
    }).getInfo()


def shape_air_no2(rows: list[dict]) -> dict:
    """Shape annual Sentinel-5P NO₂ values into deterministic, typed context."""
    by_year = {
        str(int(row["year"])): round(float(row["no2_umol_m2"]), 3)
        for row in rows
        if row.get("year") is not None and row.get("no2_umol_m2") is not None
    }
    trend = sen_mann_kendall([(int(year), value) for year, value in by_year.items()])
    return {
        "source": "Copernicus Sentinel-5P OFFL L3 NO₂ (COPERNICUS/S5P/OFFL/L3_NO2)",
        "resolution_m": 1113,
        "period": f"{min(by_year)}-{max(by_year)}" if by_year else "2019-2025",
        "unit": "µmol/m²",
        "by_year": by_year,
        "trend": trend.model_dump() if trend else None,
    }


def q_air_no2(lat: float, lng: float) -> dict:
    area = ee.Geometry.Point([lng, lat]).buffer(1000)
    collection = (
        ee.ImageCollection("COPERNICUS/S5P/OFFL/L3_NO2")
        .filterBounds(area)
        .select("tropospheric_NO2_column_number_density")
    )

    def per_year(year: ee.Number) -> ee.Feature:
        year = ee.Number(year)
        annual = (
            collection.filterDate(ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year.add(1), 1, 1))
            .median()
            .multiply(1_000_000)
            .rename("no2_umol_m2")
        )
        value = annual.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=area, scale=1113, maxPixels=1_000_000
        ).get("no2_umol_m2")
        return ee.Feature(None, {"year": year, "no2_umol_m2": value})

    rows = ee.FeatureCollection(ee.List.sequence(2019, LAST_FULL_YEAR).map(per_year)).getInfo()["features"]
    return shape_air_no2([feature.get("properties", {}) for feature in rows])


def air_no2_context(lat: float, lng: float) -> dict:
    init()
    return _cached("air-no2", (round(lat, 3), round(lng, 3)), lambda: q_air_no2(lat, lng))


def shape_neighborhood_health(raw: dict) -> NeighborhoodHealth | None:
    by_year: dict[str, NeighborhoodHealthYear] = {}
    for row in raw.get("by_year") or []:
        year = row.get("year")
        ndvi = row.get("ndvi_median")
        lst = row.get("lst_may_c")
        if year is None or (ndvi is None and lst is None):
            continue
        by_year[str(int(year))] = NeighborhoodHealthYear(
            ndvi_median=_optional_r(ndvi, 3),
            lst_may_c=_optional_r(lst, 1),
        )
    if not by_year:
        return None
    ndvi_trend = sen_mann_kendall([
        (int(year), row.ndvi_median) for year, row in by_year.items() if row.ndvi_median is not None
    ])
    lst_trend = sen_mann_kendall([
        (int(year), row.lst_may_c) for year, row in by_year.items() if row.lst_may_c is not None
    ])
    context = raw.get("context") or {}
    return NeighborhoodHealth(
        period=f"{min(by_year)}-{max(by_year)}",
        by_year=dict(sorted(by_year.items())),
        recent_ndvi=_optional_r(context.get("recent_ndvi"), 3),
        greener_than_surroundings_pct=_optional_r(context.get("greener_pct"), 0),
        recent_lst_may_c=_optional_r(context.get("recent_lst_may_c"), 1),
        lst_may_delta_c=_optional_r(context.get("lst_may_delta_c"), 1),
        ndvi_trend=ndvi_trend,
        lst_trend=lst_trend,
    )


def q_neighborhood_health(lat: float, lng: float) -> dict:
    """Land Health reused over 1 km, compared with the measured 5 km surroundings."""
    point = ee.Geometry.Point([lng, lat])
    neighbourhood = point.buffer(1000)
    context_area = point.buffer(5000)
    ring = context_area.difference(neighbourhood, 1)
    recent_start_iso = f"{LAST_FULL_YEAR - 1}-01-01"
    recent_end_iso = f"{LAST_FULL_YEAR + 1}-01-01"
    # This locality view is intentionally a recent two-year comparison. Filtering before the
    # Cloud Score+ link keeps the explicit check well within the Cloud Run request timeout.
    s2 = _sentinel2_land_health(context_area, recent_start_iso, recent_end_iso)
    lst = _landsat_temperature(context_area, recent_start_iso, recent_end_iso)

    def value_or_null(values: ee.Dictionary, key: str) -> ee.ComputedObject:
        return ee.Algorithms.If(values.contains(key), values.get(key), None)

    def per_year(year: ee.Number) -> ee.Dictionary:
        year = ee.Number(year)
        start = ee.Date.fromYMD(year, 1, 1)
        annual_ndvi = s2.filterDate(start, start.advance(1, "year")).select("ndvi").median()
        may_lst = (
            lst.filterDate(start, start.advance(1, "year"))
            .filter(ee.Filter.calendarRange(5, 5, "month"))
            .median()
        )
        ndvi_values = annual_ndvi.reduceRegion(ee.Reducer.mean(), neighbourhood, 10)
        lst_values = may_lst.reduceRegion(ee.Reducer.mean(), neighbourhood, 30)
        return ee.Dictionary({
            "year": year,
            "ndvi_median": value_or_null(ndvi_values, "ndvi"),
            "lst_may_c": value_or_null(lst_values, "lst"),
        })

    recent_start = ee.Date.fromYMD(LAST_FULL_YEAR - 1, 1, 1)
    recent_end = ee.Date.fromYMD(LAST_FULL_YEAR + 1, 1, 1)
    recent_ndvi = s2.filterDate(recent_start, recent_end).select("ndvi").median()
    neighbourhood_ndvi_values = recent_ndvi.reduceRegion(ee.Reducer.mean(), neighbourhood, 10)
    neighbourhood_ndvi = value_or_null(neighbourhood_ndvi_values, "ndvi")
    greener_fraction = ee.Algorithms.If(
        neighbourhood_ndvi_values.contains("ndvi"),
        recent_ndvi.lt(ee.Number(neighbourhood_ndvi)).reduceRegion(ee.Reducer.mean(), ring, 10).get("ndvi"),
        None,
    )

    recent_lst = (
        lst.filterDate(recent_start, recent_end)
        .filter(ee.Filter.calendarRange(5, 5, "month"))
        .median()
    )
    neighbourhood_lst_values = recent_lst.reduceRegion(ee.Reducer.mean(), neighbourhood, 30)
    ring_lst_values = recent_lst.reduceRegion(ee.Reducer.median(), ring, 30)
    neighbourhood_lst = value_or_null(neighbourhood_lst_values, "lst")
    ring_lst = value_or_null(ring_lst_values, "lst")
    lst_delta = ee.Algorithms.If(
        neighbourhood_lst_values.contains("lst"),
        ee.Algorithms.If(
            ring_lst_values.contains("lst"),
            ee.Number(neighbourhood_lst).subtract(ee.Number(ring_lst)),
            None,
        ),
        None,
    )
    return ee.Dictionary({
        "by_year": ee.List.sequence(LAST_FULL_YEAR - 1, LAST_FULL_YEAR).map(per_year),
        "context": {
            "recent_ndvi": neighbourhood_ndvi,
            "greener_pct": ee.Algorithms.If(
                neighbourhood_ndvi_values.contains("ndvi"), ee.Number(greener_fraction).multiply(100), None
            ),
            "recent_lst_may_c": neighbourhood_lst,
            "lst_may_delta_c": lst_delta,
        },
    }).getInfo()


def neighborhood_health(lat: float, lng: float) -> NeighborhoodHealth | None:
    init()
    raw = _cached("neighborhood-health", (round(lat, 3), round(lng, 3)), lambda: q_neighborhood_health(lat, lng))
    return shape_neighborhood_health(raw)


def q_water_years(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> list[dict]:
    aoi, core = _areas(lat, lng, radius_m, geometry)
    # JRC leaves never-water land empty in the yearly maps; it is confidently dry, so count it as seen.
    never_water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("max_extent").unmask(0).eq(0)

    def per_year(img: ee.Image) -> ee.Feature:
        w = img.select("waterClass").unmask(0)
        stack = ee.Image.cat(w.gte(2).rename("w"), w.gte(1).Or(never_water).rename("v"), ee.Image.constant(1).rename("n"))
        a = stack.reduceRegion(ee.Reducer.sum(), aoi, 30)
        c = stack.reduceRegion(ee.Reducer.sum(), core, 30)
        return ee.Feature(None, {"year": img.get("year"), "w": a.get("w"), "v": a.get("v"), "n": a.get("n"),
                                 "cw": c.get("w"), "cv": c.get("v"), "cn": c.get("n")})

    fc = ee.ImageCollection("JRC/GSW1_4/YearlyHistory").map(per_year)
    return [f["properties"] for f in fc.getInfo()["features"]]


def q_water_months_jrc(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> list[dict]:
    aoi, _ = _areas(lat, lng, radius_m, geometry)

    def per_month(img: ee.Image) -> ee.Feature:
        w = img.select("water")
        stack = ee.Image.cat(w.eq(2).rename("w"), w.gte(1).rename("v"), ee.Image.constant(1).rename("n"))
        s = stack.reduceRegion(ee.Reducer.sum(), aoi, 30)
        return ee.Feature(None, {"year": img.get("year"), "month": img.get("month"), "w": s.get("w"), "v": s.get("v"), "n": s.get("n")})

    fc = ee.ImageCollection("JRC/GSW1_4/MonthlyHistory").map(per_month)
    return [f["properties"] for f in fc.getInfo()["features"]]


def _dw(aoi: ee.Geometry) -> ee.ImageCollection:
    return ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(aoi)


def q_water_months_dw(
    lat: float, lng: float, radius_m: int, first_year: int = 2022, geometry: GeoJSONPolygon | None = None
) -> list[dict]:
    """Monthly water share after JRC ends, from Dynamic World's per-scene labels."""
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    dw = _dw(aoi).select("label")
    n_months = (LAST_FULL_YEAR - first_year + 1) * 12

    def per_month(i: ee.Number) -> ee.Feature:
        start = ee.Date.fromYMD(first_year, 1, 1).advance(i, "month")
        col = dw.filterDate(start, start.advance(1, "month"))
        mode = col.mode()
        stack = ee.Image.cat(mode.eq(0).rename("w"), mode.gte(0).rename("v"))
        s = stack.reduceRegion(ee.Reducer.sum(), aoi, 10)
        n = ee.Image.constant(1).reduceRegion(ee.Reducer.sum(), aoi, 10).get("constant")
        props = ee.Algorithms.If(
            col.size().gt(0),
            {"w": s.get("w"), "v": s.get("v"), "n": n},
            {"w": None, "v": 0, "n": n},
        )
        return ee.Feature(None, ee.Dictionary(props).set("i", i))

    fc = ee.FeatureCollection(ee.List.sequence(0, n_months - 1).map(per_month))
    out = []
    for f in fc.getInfo()["features"]:
        p = f["properties"]
        i = int(p["i"])
        out.append({"year": first_year + i // 12, "month": i % 12 + 1, "w": p.get("w"), "v": p.get("v"), "n": p.get("n")})
    return out


def q_landcover(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> dict[str, dict]:
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    dw = _dw(aoi).select(DW_CLASSES)

    def per_year(y: ee.Number) -> ee.Feature:
        y = ee.Number(y)
        start = ee.Date.fromYMD(y, 1, 1)
        probabilities = dw.filterDate(start, start.advance(1, "year")).mean()
        means = probabilities.reduceRegion(ee.Reducer.mean(), aoi, 10)
        return ee.Feature(None, {"year": y, "probabilities": means})

    fc = ee.FeatureCollection(ee.List.sequence(2016, LAST_FULL_YEAR).map(per_year)).getInfo()
    return {str(int(f["properties"]["year"])): f["properties"].get("probabilities") or {} for f in fc["features"]}


def _sentinel2_land_health(
    aoi: ee.Geometry,
    start_date: str = "2017-01-01",
    end_date: str = f"{LAST_FULL_YEAR + 1}-01-01",
) -> ee.ImageCollection:
    """Cloud-masked Sentinel-2 indices, retaining the acquisition timestamp."""
    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(aoi)
        .filterDate(start_date, end_date)
    )
    cloud_score = (
        ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
        .filterBounds(aoi)
        .filterDate(start_date, end_date)
    )
    linked = s2.linkCollection(cloud_score, ["cs_cdf"])

    def indices(img: ee.Image) -> ee.Image:
        reflectance = img.select(["B2", "B3", "B4", "B8", "B11"]).multiply(0.0001)
        return ee.Image.cat(
            reflectance.normalizedDifference(["B8", "B4"]).rename("ndvi"),
            reflectance.normalizedDifference(["B3", "B11"]).rename("mndwi"),
            reflectance.normalizedDifference(["B8", "B11"]).rename("ndmi"),
            reflectance.normalizedDifference(["B11", "B8"]).rename("ndbi"),
        ).updateMask(img.select("cs_cdf").gte(0.6)).copyProperties(img, ["system:time_start"])

    return linked.map(indices)


def _landsat_temperature(
    aoi: ee.Geometry,
    start_date: str = "2017-01-01",
    end_date: str = f"{LAST_FULL_YEAR + 1}-01-01",
) -> ee.ImageCollection:
    """Cloud-masked Landsat Collection 2 surface temperature in Celsius."""
    landsat = (
        ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
        .filterBounds(aoi)
        .filterDate(start_date, end_date)
    )

    def temperature(img: ee.Image) -> ee.Image:
        # QA_PIXEL bits 0-4: fill, dilated cloud, cirrus, cloud and cloud shadow.
        clear = img.select("QA_PIXEL").bitwiseAnd(31).eq(0).And(img.select("QA_RADSAT").eq(0))
        celsius = img.select("ST_B10").multiply(0.00341802).add(149.0).subtract(273.15)
        return celsius.rename("lst").updateMask(clear).copyProperties(img, ["system:time_start"])

    return landsat.map(temperature)


def q_land_health(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> dict:
    """Yearly land-health indices, seasonality and neighbourhood context in one EE request."""
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    neighbourhood = aoi.buffer(2000)
    ring = neighbourhood.difference(aoi, 1)
    s2 = _sentinel2_land_health(neighbourhood)
    lst = _landsat_temperature(neighbourhood)

    def value_or_null(values: ee.Dictionary, key: str) -> ee.ComputedObject:
        # reduceRegion omits a key when every pixel was masked; that is unknown, never zero.
        return ee.Algorithms.If(values.contains(key), values.get(key), None)

    def per_year(y: ee.Number) -> ee.Dictionary:
        y = ee.Number(y)
        start = ee.Date.fromYMD(y, 1, 1)
        annual = s2.filterDate(start, start.advance(1, "year"))
        percentiles = annual.select(["ndvi", "mndwi", "ndmi", "ndbi"]).reduce(ee.Reducer.percentile([10, 50, 90]))
        values = percentiles.reduceRegion(ee.Reducer.mean(), aoi, 10)
        dry = annual.filter(ee.Filter.calendarRange(12, 5, "month")).select("ndmi").median()
        wet = annual.filter(ee.Filter.calendarRange(6, 11, "month")).select("ndmi").median()
        dry_values = dry.reduceRegion(ee.Reducer.mean(), aoi, 10)
        wet_values = wet.reduceRegion(ee.Reducer.mean(), aoi, 10)
        may_lst = lst.filterDate(start, start.advance(1, "year")).filter(ee.Filter.calendarRange(5, 5, "month"))
        lst_values = may_lst.median().reduceRegion(ee.Reducer.mean(), aoi, 30)
        return ee.Dictionary({
            "year": y,
            "observations_s2": annual.size(),
            "observations_lst": may_lst.size(),
            "ndvi_median": value_or_null(values, "ndvi_p50"),
            "ndvi_p10": value_or_null(values, "ndvi_p10"),
            "ndvi_p90": value_or_null(values, "ndvi_p90"),
            "mndwi_median": value_or_null(values, "mndwi_p50"),
            "ndmi_median": value_or_null(values, "ndmi_p50"),
            "ndmi_dry": value_or_null(dry_values, "ndmi"),
            "ndmi_wet": value_or_null(wet_values, "ndmi"),
            "ndbi_median": value_or_null(values, "ndbi_p50"),
            "lst_may_c": value_or_null(lst_values, "lst"),
        })

    def per_month(month: ee.Number) -> ee.Dictionary:
        month = ee.Number(month)
        monthly = s2.filter(ee.Filter.calendarRange(month, month, "month"))
        values = monthly.select("ndvi").median().reduceRegion(ee.Reducer.mean(), aoi, 10)
        return ee.Dictionary({"month": month, "ndvi": value_or_null(values, "ndvi"), "observations": monthly.size()})

    recent_start = ee.Date.fromYMD(LAST_FULL_YEAR - 1, 1, 1)
    recent_end = ee.Date.fromYMD(LAST_FULL_YEAR + 1, 1, 1)
    recent_ndvi = s2.filterDate(recent_start, recent_end).select("ndvi").median()
    plot_ndvi_values = recent_ndvi.reduceRegion(ee.Reducer.median(), aoi, 10)
    plot_ndvi = value_or_null(plot_ndvi_values, "ndvi")
    lower_fraction = ee.Algorithms.If(
        plot_ndvi_values.contains("ndvi"),
        recent_ndvi.lt(ee.Number(plot_ndvi)).reduceRegion(ee.Reducer.mean(), ring, 10).get("ndvi"),
        None,
    )

    recent_lst = (
        lst.filterDate(recent_start, recent_end)
        .filter(ee.Filter.calendarRange(5, 5, "month"))
        .median()
    )
    plot_lst_values = recent_lst.reduceRegion(ee.Reducer.mean(), aoi, 30)
    ring_lst_values = recent_lst.reduceRegion(ee.Reducer.median(), ring, 30)
    plot_lst = value_or_null(plot_lst_values, "lst")
    ring_lst = value_or_null(ring_lst_values, "lst")
    lst_delta = ee.Algorithms.If(
        plot_lst_values.contains("lst"),
        ee.Algorithms.If(ring_lst_values.contains("lst"), ee.Number(plot_lst).subtract(ee.Number(ring_lst)), None),
        None,
    )

    payload = ee.Dictionary({
        "by_year": ee.List.sequence(2017, LAST_FULL_YEAR).map(per_year),
        "monthly_ndvi": ee.List.sequence(1, 12).map(per_month),
        "context": {
            "ndvi_percentile": ee.Algorithms.If(plot_ndvi_values.contains("ndvi"), ee.Number(lower_fraction).multiply(100), None),
            "lst_may_delta_c": lst_delta,
        },
    })
    return payload.getInfo()


def q_monsoon(
    lat: float,
    lng: float,
    radius_m: int,
    wet_months: list[int],
    geometry: GeoJSONPolygon | None = None,
) -> list[dict]:
    """Dynamic World scenes in this location's six wettest CHIRPS months since 2017."""
    aoi, core = _areas(lat, lng, radius_m, geometry)
    month_filter = ee.Filter.Or(*[ee.Filter.calendarRange(month, month, "month") for month in wet_months])
    col = (
        _dw(core)
        .filterDate("2017-01-01", f"{LAST_FULL_YEAR + 1}-01-01")
        .filter(month_filter)
        .select("label")
    )
    n = ee.Image.constant(1).reduceRegion(ee.Reducer.sum(), core, 10).get("constant")

    def per_scene(img: ee.Image) -> ee.Feature:
        lab = img.select("label")
        wet = lab.eq(0).Or(lab.eq(3))
        s = ee.Image.cat(wet.rename("w"), lab.gte(0).rename("v")).reduceRegion(ee.Reducer.sum(), core, 10)
        return ee.Feature(None, {"t": img.get("system:time_start"), "w": s.get("w"), "v": s.get("v"), "n": n})

    return [f["properties"] for f in col.map(per_scene).getInfo()["features"]]


def q_terrain(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> dict:
    _, core = _areas(lat, lng, radius_m, geometry)
    fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM").mosaic().rename("elevation")
    merit = ee.Image("MERIT/Hydro/v1_0_1")
    plot_elevation = fabdem.reduceRegion(ee.Reducer.mean(), core, 30).get("elevation")

    def context(distance_m: int) -> ee.Dictionary:
        area = core.buffer(distance_m)
        median = fabdem.reduceRegion(ee.Reducer.median(), area, 30).get("elevation")
        higher = fabdem.gt(ee.Number(plot_elevation)).reduceRegion(ee.Reducer.mean(), area, 30).get("elevation")
        return ee.Dictionary({
            "relative": ee.Number(plot_elevation).subtract(ee.Number(median)),
            "higher": higher,
        })

    hand = merit.select("hnd").reduceRegion(ee.Reducer.mean(), core, 90).get("hnd")
    return ee.Dictionary({
        "plot_elevation": plot_elevation,
        "context_500m": context(500),
        "context_2km": context(2000),
        "hand": hand,
    }).getInfo()


def q_rain(lat: float, lng: float) -> list[dict]:
    pt = ee.Geometry.Point([lng, lat])
    col = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate("2015-01-01", "2025-01-01").select("precipitation")
    rows = col.getRegion(pt, 5566).getInfo()
    idx = rows[0].index("precipitation")
    t_idx = rows[0].index("time")
    rows = sorted(rows[1:], key=lambda r: r[t_idx])
    return [{"t": int(r[t_idx]), "precipitation": float(r[idx] or 0.0)} for r in rows]


def q_buildings(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> list[dict]:
    """Annual Open Buildings presence/count/height summaries; no date is inferred beyond 2016-2023."""
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    collection = ee.ImageCollection("GOOGLE/Research/open-buildings-temporal/v1").filterBounds(aoi)

    def per_year(year: ee.Number) -> ee.Feature:
        year = ee.Number(year)
        start = ee.Date.fromYMD(year, 1, 1)
        image = collection.filterDate(start, start.advance(1, "year")).mosaic()
        presence = image.select("building_presence")
        height = image.select("building_height").updateMask(presence.gte(0.5))
        count = image.select("building_fractional_count")
        return ee.Feature(None, {
            "year": year,
            "presence_max": presence.reduceRegion(ee.Reducer.max(), aoi, 4).get("building_presence"),
            "estimated_count": count.reduceRegion(ee.Reducer.sum(), aoi, 4).get("building_fractional_count"),
            "mean_height_m": height.reduceRegion(ee.Reducer.mean(), aoi, 4).get("building_height"),
        })

    features = ee.FeatureCollection(ee.List.sequence(2016, 2023).map(per_year)).getInfo()["features"]
    return [feature["properties"] for feature in features]


def q_global_floods(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> list[dict]:
    """Mapped flood events intersecting the AOI, excluding JRC permanent water."""
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    collection = ee.ImageCollection("GLOBAL_FLOOD_DB/MODIS_EVENTS/V1").filterBounds(aoi)
    total = ee.Image.constant(1).reduceRegion(ee.Reducer.sum(), aoi, 250).get("constant")

    def per_event(image: ee.Image) -> ee.Feature:
        clear = image.select("clear_perc").gte(20)
        flooded = image.select("flooded").eq(1).And(image.select("jrc_perm_water").neq(1))
        sums = ee.Image.cat(
            flooded.updateMask(clear).rename("flooded"),
            clear.rename("valid"),
        ).reduceRegion(ee.Reducer.sum(), aoi, 250)
        return ee.Feature(None, {
            "event_id": image.get("id"),
            "t": image.get("system:time_start"),
            "flooded": sums.get("flooded"),
            "valid": sums.get("valid"),
            "total": total,
        })

    return [feature["properties"] for feature in collection.map(per_event).getInfo()["features"]]


def q_flood_hazard(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> dict:
    """WRI historical riverine 100-year hazard; this is regional screening, not plot mapping."""
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    depth = (
        ee.ImageCollection("WRI/Aqueduct_Flood_Hazard_Maps/V2")
        .filter(ee.Filter.eq("climatescenario", "historical"))
        .filter(ee.Filter.eq("floodtype", "inunriver"))
        .filter(ee.Filter.eq("year", 1980))
        .filter(ee.Filter.eq("returnperiod", 100))
        .select("inundation_depth")
        .mosaic()
        .unmask(0)
    )
    stats = depth.reduceRegion(ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True), aoi, 1000)
    exposed = depth.gt(0).reduceRegion(ee.Reducer.mean(), aoi, 1000).get("inundation_depth")
    return ee.Dictionary({
        "exposed_fraction": exposed,
        "mean_depth_m": stats.get("inundation_depth_mean"),
        "max_depth_m": stats.get("inundation_depth_max"),
    }).getInfo()


def q_embedding(lat: float, lng: float, radius_m: int, geometry: GeoJSONPolygon | None = None) -> dict:
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    col = ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL").filterBounds(aoi)
    years = list(range(2017, 2025))

    def emb(y: int) -> ee.Image:
        return col.filterDate(f"{y}-01-01", f"{y + 1}-01-01").mosaic()

    def change(a: ee.Image, b: ee.Image) -> ee.ComputedObject:
        d = ee.Image.constant(1).subtract(a.multiply(b).reduce(ee.Reducer.sum()))
        return d.reduceRegion(ee.Reducer.mean(), aoi, 10).values().get(0)

    pairs = {str(y + 1): change(emb(y), emb(y + 1)) for y in years[:-1]}
    return ee.Dictionary({"total": change(emb(years[0]), emb(years[-1])), "pairs": pairs}).getInfo()


def q_s1_flood(
    lat: float,
    lng: float,
    radius_m: int,
    start: str,
    end: str,
    geometry: GeoJSONPolygon | None = None,
    baseline_months: list[int] | None = None,
) -> dict | None:
    """Sentinel-1 VV change detection: share of the area that turned dark (flooded) vs a dry-season baseline."""
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(aoi)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .select("VV")
    )
    year = start[:4]
    baseline_months = baseline_months or [1, 2, 3, 4]
    baseline_filter = ee.Filter.Or(
        *[ee.Filter.calendarRange(month, month, "month") for month in baseline_months]
    )
    base = s1.filterDate(f"{year}-01-01", f"{int(year) + 1}-01-01").filter(baseline_filter).median()
    permanent = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").unmask(0).gt(80)
    event = s1.filterDate(start, end)

    def per_scene(img: ee.Image) -> ee.Feature:
        flooded = img.lt(-16).And(base.subtract(img).gt(3)).And(permanent.Not())
        s = ee.Image.cat(flooded.rename("f"), img.mask().rename("v")).reduceRegion(ee.Reducer.sum(), aoi, 10)
        return ee.Feature(None, {"t": img.get("system:time_start"), "f": s.get("f"), "v": s.get("v")})

    feats = [f["properties"] for f in event.map(per_scene).getInfo()["features"]]
    feats = [f for f in feats if (f.get("v") or 0) > 0]
    if not feats:
        return None
    best = max(feats, key=lambda f: (f.get("f") or 0) / f["v"])
    return {"t": best["t"], "fraction": (best.get("f") or 0) / best["v"]}


# ---------- shaping into the Evidence schema ----------

def _shape_jrc(d: dict, years: list[dict]) -> WaterHistory:
    tr = int(d.get("transition") or 0)
    core_years = sorted(
        int(y["year"]) for y in years if _clear(y.get("cv"), y.get("cn")) and (y.get("cw") or 0) / y["cv"] >= 0.3
    )
    return WaterHistory(
        occurrence_core_pct=_r(d.get("core"), 1),
        occurrence_area_pct=_r(d.get("area"), 1),
        transition_core=TRANSITIONS.get(tr),
        years_water_core=core_years,
    )


def _shape_water_years(years: list[dict]) -> WaterYears:
    # Years the satellites barely saw (early Landsat gaps, clouds) are left out, not shown as dry.
    return WaterYears(by_year={
        str(int(y["year"])): _r((y.get("w") or 0) / y["v"]) for y in sorted(years, key=lambda y: y["year"]) if _clear(y.get("v"), y.get("n"))
    })


def _shape_months(rows: list[dict]) -> dict[str, list[float | None]]:
    out: dict[str, list[float | None]] = {}
    for r in rows:
        y, m = str(int(r["year"])), int(r["month"])
        months = out.setdefault(y, [None] * 12)
        v, n = r.get("v") or 0, r.get("n") or 0
        # Under half the area seen clearly (clouds, gaps): no reading that month.
        months[m - 1] = _r((r.get("w") or 0) / v) if n and v >= 0.5 * n else None
    return out


def _shape_landcover(probabilities: dict[str, dict]) -> Landcover | None:
    by_year = {}
    for y, raw in probabilities.items():
        values = {name: max(0.0, float(raw.get(name) or 0.0)) for name in DW_CLASSES}
        total = sum(values.values())
        if total <= 0:
            continue
        # Dynamic World probabilities sum to one per pixel. Normalising after the spatial/annual
        # mean also absorbs tiny floating-point and masking differences between bands.
        by_year[y] = LandcoverYear(**{name: _r(value / total) for name, value in values.items()})
    return Landcover(by_year=by_year) if len(by_year) >= 2 else None


def _shape_monsoon(scenes: list[dict], wet_months: list[int]) -> Monsoon:
    obs: dict[str, int] = {}
    seen: set[int] = set()
    for s in scenes:
        n, v = s.get("n") or 0, s.get("v") or 0
        if not n or v < 0.5 * n:
            continue  # mostly cloud over the plot
        y = datetime.fromtimestamp(s["t"] / 1000, tz=timezone.utc).year
        obs[str(y)] = obs.get(str(y), 0) + 1
        if (s.get("w") or 0) / v >= 0.3:
            seen.add(y)
    return Monsoon(
        wet_months=wet_months,
        seen=sorted(seen),
        observed_years=len(obs),
        obs_per_year=dict(sorted(obs.items())),
    )


def _shape_rain(rows: list[dict]) -> Rain | None:
    if len(rows) < 365:
        return None
    daily = [float(row.get("precipitation") or 0.0) for row in rows]
    monthly_totals: dict[tuple[int, int], float] = {}
    for row in rows:
        when = datetime.fromtimestamp(int(row["t"]) / 1000, tz=timezone.utc)
        key = (when.year, when.month)
        monthly_totals[key] = monthly_totals.get(key, 0.0) + float(row.get("precipitation") or 0.0)
    by_month = {
        month: [total for (year, row_month), total in monthly_totals.items() if row_month == month]
        for month in range(1, 13)
    }
    climatology = {
        str(month): _r(sum(values) / len(values), 1)
        for month, values in by_month.items()
        if values
    }
    if len(climatology) != 12:
        return None
    wet_months = sorted(
        sorted(range(1, 13), key=lambda month: (-climatology[str(month)], month))[:6]
    )
    years = len(daily) / 365.25
    heavy = sum(1 for d in daily if d >= HEAVY_RAIN_MM) / years
    max3 = max(sum(daily[i:i + 3]) for i in range(len(daily) - 2))
    return Rain(
        monthly_climatology_mm=climatology,
        wet_months=wet_months,
        heavy_days_per_year_avg=_r(heavy, 1),
        max_3day_mm=_r(max3, 0),
    )


def _shape_terrain(raw: dict) -> Terrain | None:
    context_500m = raw.get("context_500m") or {}
    context_2km = raw.get("context_2km") or {}
    required = (
        raw.get("plot_elevation"),
        raw.get("hand"),
        context_500m.get("relative"),
        context_500m.get("higher"),
        context_2km.get("relative"),
        context_2km.get("higher"),
    )
    if any(value is None for value in required):
        return None
    return Terrain(
        plot_elevation_m=_r(raw["plot_elevation"], 1),
        relative_height_500m_m=_r(context_500m["relative"], 1),
        relative_height_2km_m=_r(context_2km["relative"], 1),
        lower_than_500m_pct=_r(context_500m["higher"] * 100, 0),
        lower_than_2km_pct=_r(context_2km["higher"] * 100, 0),
        hand_m=_r(raw["hand"], 1),
    )


def _shape_buildings(rows: list[dict]) -> BuildingHistory | None:
    by_year: dict[str, BuildingYear] = {}
    for row in rows:
        if row.get("year") is None or row.get("presence_max") is None or row.get("estimated_count") is None:
            continue
        year = str(int(row["year"]))
        by_year[year] = BuildingYear(
            presence_max=_r(max(0.0, min(1.0, row["presence_max"])), 3),
            estimated_count=_r(max(0.0, row["estimated_count"]), 1),
            mean_height_m=_optional_r(row.get("mean_height_m"), 1),
        )
    if len(by_year) < 2:
        return None

    years = sorted(by_year)
    detected = [year for year in years if by_year[year].presence_max >= 0.5 and by_year[year].estimated_count >= 0.5]
    growth = {
        year: by_year[year].estimated_count - by_year[years[index - 1]].estimated_count
        for index, year in enumerate(years)
        if index > 0
    }
    strongest = max(growth, key=growth.get) if growth and max(growth.values()) >= 0.5 else None
    return BuildingHistory(
        by_year=dict(sorted(by_year.items())),
        first_detected_year=int(detected[0]) if detected else None,
        strongest_growth_year=int(strongest) if strongest else None,
    )


def _shape_historic_floods(rows: list[dict]) -> HistoricFloods:
    events: list[HistoricFloodEvent] = []
    for row in rows:
        valid, total = row.get("valid") or 0, row.get("total") or 0
        if not total or valid < 0.5 * total or row.get("event_id") is None or row.get("t") is None:
            continue
        fraction = (row.get("flooded") or 0) / valid
        if fraction < 0.01:
            continue
        year = datetime.fromtimestamp(row["t"] / 1000, tz=timezone.utc).year
        events.append(HistoricFloodEvent(
            event_id=int(row["event_id"]),
            year=year,
            flooded_fraction=_r(fraction),
        ))
    events.sort(key=lambda event: (event.year, event.event_id))
    return HistoricFloods(
        events=events,
        max_flooded_fraction=max((event.flooded_fraction for event in events), default=0),
        latest_event_year=max((event.year for event in events), default=None),
    )


def _shape_flood_hazard(raw: dict) -> FloodHazard | None:
    values = (raw.get("exposed_fraction"), raw.get("mean_depth_m"), raw.get("max_depth_m"))
    if any(value is None for value in values):
        return None
    return FloodHazard(
        exposed_fraction=_r(raw["exposed_fraction"]),
        inundation_depth_mean_m=_r(raw["mean_depth_m"], 2),
        inundation_depth_max_m=_r(raw["max_depth_m"], 2),
    )


def _shape_embedding(d: dict) -> EmbeddingChange | None:
    if d.get("total") is None:
        return None
    pairs = {y: v for y, v in (d.get("pairs") or {}).items() if v is not None}
    return EmbeddingChange(
        change=_r(d["total"], 2),
        biggest_change_year=int(max(pairs, key=pairs.get)) if pairs else None,
    )


def _shape_land_health(raw: dict) -> LandHealth | None:
    fields = (
        "ndvi_median",
        "ndvi_p10",
        "ndvi_p90",
        "mndwi_median",
        "ndmi_median",
        "ndmi_dry",
        "ndmi_wet",
        "ndbi_median",
        "lst_may_c",
    )
    by_year: dict[str, LandHealthYear] = {}
    for row in raw.get("by_year") or []:
        year = row.get("year")
        values = {field: _optional_r(row.get(field), 3 if field != "lst_may_c" else 1) for field in fields}
        if year is None or not any(value is not None for value in values.values()):
            continue
        by_year[str(int(year))] = LandHealthYear(
            **values,
            observations_s2=int(row.get("observations_s2") or 0),
            observations_lst=int(row.get("observations_lst") or 0),
        )
    if len(by_year) < 2:
        return None

    trend_fields = {
        "ndvi": "ndvi_median",
        "mndwi": "mndwi_median",
        "ndmi": "ndmi_median",
        "ndbi": "ndbi_median",
        "lst": "lst_may_c",
    }
    trends = {}
    for name, field in trend_fields.items():
        result = sen_mann_kendall([
            (int(year), value)
            for year, item in by_year.items()
            if (value := getattr(item, field)) is not None
        ])
        if result is not None:
            trends[name] = result

    monthly = {
        str(int(row["month"])): _r(row["ndvi"], 3)
        for row in raw.get("monthly_ndvi") or []
        if row.get("month") is not None and row.get("ndvi") is not None
    }
    context = raw.get("context") or {}
    return LandHealth(
        period=f"{min(by_year)}-{max(by_year)}",
        by_year=dict(sorted(by_year.items())),
        monthly_ndvi_climatology=monthly,
        trends=trends,
        context=LandHealthContext(
            ndvi_percentile=_optional_r(context.get("ndvi_percentile"), 0),
            lst_may_delta_c=_optional_r(context.get("lst_may_delta_c"), 1),
        ),
    )


# ---------- provider ----------

class EarthEngineProvider:
    STEPS = [
        ("landcover", "Land cover 2016-2025 (Dynamic World, 10 m)"),
        ("land_health", "Land health 2017-2025 (Sentinel-2 and Landsat)"),
        ("water", "Water history and location-specific wet-season scenes"),
        ("flood_models", "Historic flood events and regional flood hazard"),
        ("terrain", "Plot terrain (FABDEM 30 m) and regional drainage context"),
        ("buildings", "Building presence and growth 2016-2023 (Open Buildings)"),
        ("rain", "Rainfall and local wet-season climatology 2015-2024 (CHIRPS)"),
        ("change", "Change score (AlphaEarth embeddings)"),
    ]

    def __init__(self) -> None:
        init()

    def collect(self, req: ReportRequest, progress: ProgressFn) -> Evidence:
        lat, lng, r = round(req.lat, 5), round(req.lng, 5), req.radius_m
        geometry = req.geometry
        loc = ("boundary", boundary_hash(geometry.coordinates)) if geometry else ("circle", lat, lng, r)
        results: dict[str, Any] = {}
        failed: list[str] = []

        # The wet-season scene query depends on these six locally wettest months, so CHIRPS is the
        # one intentional first-stage query. A missing climatology leaves the seasonal signal empty.
        rain_evidence: Rain | None = None
        try:
            rain_rows = _cached("rain", (round(lat, 2), round(lng, 2)), lambda: q_rain(lat, lng))
            rain_evidence = _shape_rain(rain_rows)
            if rain_evidence is None:
                failed.append("rain")
        except Exception as exc:
            log.warning("earth engine query rain failed: %s", exc)
            failed.append("rain")
        progress("rain", dict(self.STEPS)["rain"])

        jobs: dict[str, Callable[[], Any]] = {
            "jrc": lambda: _cached("jrc", loc, lambda: q_jrc(lat, lng, r, geometry)),
            "years": lambda: _cached("years", loc, lambda: q_water_years(lat, lng, r, geometry)),
            "months_jrc": lambda: _cached("months-jrc", loc, lambda: q_water_months_jrc(lat, lng, r, geometry)),
            "months_dw": lambda: _cached("months-dw", loc, lambda: q_water_months_dw(lat, lng, r, geometry=geometry)),
            "landcover": lambda: _cached("landcover", loc, lambda: q_landcover(lat, lng, r, geometry)),
            "land_health": lambda: _cached("land-health", loc, lambda: q_land_health(lat, lng, r, geometry)),
            "terrain": lambda: _cached("terrain", loc, lambda: q_terrain(lat, lng, r, geometry)),
            "buildings": lambda: _cached("buildings", loc, lambda: q_buildings(lat, lng, r, geometry)),
            "historic_floods": lambda: _cached("historic-floods", loc, lambda: q_global_floods(lat, lng, r, geometry)),
            "flood_hazard": lambda: _cached("flood-hazard", loc, lambda: q_flood_hazard(lat, lng, r, geometry)),
            "embedding": lambda: _cached("embedding", loc, lambda: q_embedding(lat, lng, r, geometry)),
        }
        if rain_evidence is not None:
            jobs["monsoon"] = lambda: _cached(
                "wet-season",
                (*loc, tuple(rain_evidence.wet_months)),
                lambda: q_monsoon(lat, lng, r, rain_evidence.wet_months, geometry),
            )
        else:
            failed.append("monsoon")
        step_of = {"landcover": "landcover", "land_health": "land_health", "jrc": "water", "years": "water", "months_jrc": "water", "months_dw": "water",
                   "monsoon": "water", "terrain": "terrain", "buildings": "buildings",
                   "historic_floods": "flood_models", "flood_hazard": "flood_models", "embedding": "change"}
        with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
            futures = {pool.submit(fn): name for name, fn in jobs.items()}
            pending = {s for s, _ in self.STEPS} - {"rain"}
            for fut in as_completed(futures):
                name = futures[fut]
                try:
                    results[name] = fut.result()
                except Exception as exc:  # one dataset failing must not sink the report
                    log.warning("earth engine query %s failed: %s", name, exc)
                    failed.append(name)
                step = step_of[name]
                if step in pending and all(n in results or n in failed for n, s in step_of.items() if s == step):
                    pending.discard(step)
                    progress(step, dict(self.STEPS)[step])

        ev = Evidence()
        if "jrc" in results and "years" in results:
            ev.jrc = _shape_jrc(results["jrc"], results["years"])
        if "years" in results:
            ev.water_years = _shape_water_years(results["years"])
        months = {}
        if "months_jrc" in results:
            months.update(_shape_months(results["months_jrc"]))
        if "months_dw" in results:
            months.update(_shape_months(results["months_dw"]))
        if months:
            ev.water_months = WaterMonths(
                source="JRC Global Surface Water MonthlyHistory 1984-2021 + Dynamic World 2022-2025",
                by_year=dict(sorted(months.items())),
            )
        if "landcover" in results:
            ev.landcover = _shape_landcover(results["landcover"])
        if "land_health" in results:
            ev.land_health = _shape_land_health(results["land_health"])
        if "monsoon" in results and rain_evidence is not None:
            ev.monsoon = _shape_monsoon(results["monsoon"], rain_evidence.wet_months)
        if "terrain" in results:
            ev.terrain = _shape_terrain(results["terrain"])
            if ev.terrain is None:
                failed.append("terrain")
        if "buildings" in results:
            ev.buildings = _shape_buildings(results["buildings"])
            if ev.buildings is None:
                failed.append("buildings")
        if "historic_floods" in results:
            ev.historic_floods = _shape_historic_floods(results["historic_floods"])
        if "flood_hazard" in results:
            ev.flood_hazard = _shape_flood_hazard(results["flood_hazard"])
            if ev.flood_hazard is None:
                failed.append("flood_hazard")
        ev.rain = rain_evidence
        if "embedding" in results:
            ev.embedding = _shape_embedding(results["embedding"])
        ev.unavailable = sorted(set(failed))
        return ev

    def drilldowns(self, req: ReportRequest, evidence: Evidence) -> "EarthEngineDrilldowns":
        return EarthEngineDrilldowns(req, evidence)

    def quick(self, lat: float, lng: float, radius_m: int) -> Evidence:
        lat, lng = round(lat, 5), round(lng, 5)
        loc = (lat, lng, radius_m)
        with ThreadPoolExecutor(max_workers=3) as pool:
            j = pool.submit(_cached, "jrc", loc, lambda: q_jrc(lat, lng, radius_m))
            y = pool.submit(_cached, "years", loc, lambda: q_water_years(lat, lng, radius_m))
            t = pool.submit(_cached, "terrain", loc, lambda: q_terrain(lat, lng, radius_m))
        ev = Evidence()
        try:
            ev.jrc = _shape_jrc(j.result(), y.result())
        except Exception as exc:
            log.warning("quick jrc failed: %s", exc)
        try:
            td = t.result()
            ev.terrain = _shape_terrain(td)
        except Exception as exc:
            log.warning("quick terrain failed: %s", exc)
        return ev


class EarthEngineDrilldowns:
    def __init__(self, req: ReportRequest, evidence: Evidence) -> None:
        self.req = req
        self.evidence = evidence

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
        lat, lng, r = round(self.req.lat, 5), round(self.req.lng, 5), self.req.radius_m
        geometry = self.req.geometry
        loc = ("boundary", boundary_hash(geometry.coordinates)) if geometry else ("circle", lat, lng, r)
        wet_months = self.evidence.monsoon.wet_months if self.evidence.monsoon else []
        baseline_months = [month for month in range(1, 13) if month not in wet_months] or [1, 2, 3, 4]
        try:
            d = _cached(
                "s1",
                (*loc, start, end, tuple(baseline_months)),
                lambda: q_s1_flood(lat, lng, r, start, end, geometry, baseline_months),
            )
        except Exception as exc:
            log.warning("radar flood check failed: %s", exc)
            return None
        if d is None:
            return None
        when = datetime.fromtimestamp(d["t"] / 1000, tz=timezone.utc).date().isoformat()
        return S1Flood(event=when, flooded_fraction_aoi=_r(d["fraction"]))

    def landcover_detail(self, year: int) -> LandcoverYear | None:
        lc = self.evidence.landcover
        return lc.by_year.get(str(year)) if lc else None

    def local_news(self, place: str) -> list[NewsItem]:
        return []  # no real news source wired yet; never invent articles



# ---------- real map layers (Earth Engine tiles) ----------

def map_layers(
    lat: float,
    lng: float,
    radius_m: int,
    flood_date: str | None,
    year: int | None = None,
    geometry: GeoJSONPolygon | None = None,
) -> dict[str, str]:
    """XYZ tile URLs of the real evidence, clipped to a little beyond the analysis circle.

    The URLs are short-lived (hours) and need no key, so the browser can fetch them directly.
    """
    init()
    aoi, _ = _areas(lat, lng, radius_m, geometry)
    clip = aoi.buffer(250 if geometry else radius_m * 0.8)

    def url(img: ee.Image, vis: dict, smooth: bool = True) -> str:
        # Bilinear resampling softens the 30-90 m pixel edges on screen; the values are unchanged.
        img = img.resample("bilinear") if smooth else img
        return img.clip(clip).getMapId(vis)["tile_fetcher"].url_format

    gsw = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    fabdem = ee.ImageCollection("projects/sat-io/open-datasets/FABDEM").mosaic().rename("elevation")
    relative_terrain = fabdem.subtract(fabdem.focalMedian(radius=500, units="meters")).rename("relative")
    out = {
        # How often each pixel was water, 1984-2021: pale = occasionally, deep blue = almost always.
        "water": url(gsw.select("occurrence").selfMask(), {"min": 0, "max": 100, "palette": ["9ecbff", "3b82f6", "1e3a8a"]}),
        # FABDEM height relative to the 500 m neighbourhood: deeper local depressions are stronger amber.
        "lowlying": url(
            relative_terrain.updateMask(relative_terrain.lt(0)),
            {"min": -5, "max": 0, "palette": ["f59e0b", "fcd34d"]},
        ),
    }
    dw_built = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(clip).select("built")
    built_then = dw_built.filterDate("2016-01-01", "2018-01-01").mean()
    built_now = dw_built.filterDate(f"{LAST_FULL_YEAR - 1}-01-01", f"{LAST_FULL_YEAR + 1}-01-01").mean()
    built_growth = built_now.subtract(built_then)
    # Probability increase from the 2016-17 window to the latest two full years.
    out["built"] = url(built_growth.updateMask(built_growth.gte(0.1)), {"min": 0.1, "max": 1, "palette": ["f27a8c"]}, smooth=False)

    health_year = year if year is not None and 2017 <= year <= LAST_FULL_YEAR else LAST_FULL_YEAR
    start = f"{health_year}-01-01"
    end = f"{health_year + 1}-01-01"
    ndvi = _sentinel2_land_health(clip).filterDate(start, end).select("ndvi").median()
    may_lst = (
        _landsat_temperature(clip)
        .filterDate(start, end)
        .filter(ee.Filter.calendarRange(5, 5, "month"))
        .median()
    )
    out["ndvi"] = url(ndvi, {"min": -0.1, "max": 0.8, "palette": ["8b7d68", "d8c98b", "78b66f", "226b52"]}, smooth=False)
    out["lst"] = url(may_lst, {"min": 20, "max": 45, "palette": ["396ab1", "76c6c3", "f4d35e", "ee964b", "be3f57"]}, smooth=False)

    if flood_date:
        s1 = (
            ee.ImageCollection("COPERNICUS/S1_GRD")
            .filterBounds(clip)
            .filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
            .select("VV")
        )
        d = ee.Date(flood_date)
        event = s1.filterDate(d, d.advance(1, "day")).mosaic()
        base = s1.filterDate(f"{flood_date[:4]}-01-01", f"{flood_date[:4]}-05-01").median()
        permanent = gsw.select("occurrence").unmask(0).gt(80)
        flooded = event.lt(-16).And(base.subtract(event).gt(3)).And(permanent.Not())
        out["flood"] = url(flooded.selfMask(), {"palette": ["a855f7"]}, smooth=False)
    return out
