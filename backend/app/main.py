import logging
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import alternatives
from app.agent import actions, brochure, compare, llm, qa, translate
from app.config import get_settings
from app.locality import (
    AirQualityUnavailable,
    AmenitiesUnavailable,
    NeighborhoodHealthUnavailable,
    RoutesUnavailable,
    get_air_quality_report,
    get_commute_report,
    get_heatmap_tile,
    get_neighborhood_health,
    get_locality_report,
)
from app.pipeline import new_report, run_report
from app.schemas import (
    ActionKit,
    AlternativesResponse,
    AskRequest,
    AskResponse,
    BrochureResponse,
    CompareRequest,
    CompareResponse,
    AirQualityReport,
    CommuteReport,
    CommuteRequest,
    Lang,
    LocalityReport,
    NeighborhoodHealth,
    Report,
    ReportRequest,
)
from app.services import places
from app.services.store import get_store

BROCHURE_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_BROCHURE_BYTES = 10 * 1024 * 1024


class TranslateRequest(BaseModel):
    lang: Lang


class LocalityRequest(BaseModel):
    lat: float
    lng: float
    label: str = "Selected Location"
    radius_m: int = 2500

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SAMPAAA API", version=get_settings().pipeline_version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Hero locations shown as one-tap examples. Mock mode labels them as demo data.
EXAMPLES = [
    {"id": "former-lake", "label": "Layout on a former lake bed", "city": "Bengaluru",
     "lat": 12.9505, "lng": 77.7005, "radius_m": 250},
    {"id": "high-ground", "label": "High-ground control", "city": "Bengaluru",
     "lat": 13.0315, "lng": 77.5905, "radius_m": 250},
    {"id": "jakarta", "label": "Flood-prone district", "city": "Jakarta",
     "lat": -6.1505, "lng": 106.8005, "radius_m": 250},
]


@app.get("/healthz")
@app.get("/api/healthz")
def healthz() -> dict:
    s = get_settings()
    return {
        "ok": True,
        "evidence_provider": s.evidence_provider,
        "store": s.store,
        "agent": llm.agent_enabled(),
        "model": s.gemini_model,
    }


# Real places for Earth Engine mode, picked from the data (lost water + new building, or none of it).
REAL_EXAMPLES = [
    {"id": "former-lake", "label": "New layout on a seasonal wetland", "city": "North Bengaluru",
     "lat": 13.10094, "lng": 77.64956, "radius_m": 250},
    {"id": "lakeside", "label": "Plots beside Bellandur Lake", "city": "Bengaluru",
     "lat": 12.9330, "lng": 77.6610, "radius_m": 250},
    {"id": "high-ground", "label": "Established high ground", "city": "Basavanagudi, Bengaluru",
     "lat": 12.9425, "lng": 77.5737, "radius_m": 250},
    {"id": "jakarta", "label": "Low-lying district", "city": "Jakarta",
     "lat": -6.1505, "lng": 106.8005, "radius_m": 250},
]


_LAYER_CACHE: dict[str, tuple[float, dict[str, str]]] = {}


@app.get("/api/reports/{report_id}/layers")
def report_layers(report_id: str, year: int | None = None) -> dict:
    """Real evidence layers as map tiles. Empty in demo mode, where the map draws illustrative shapes."""
    report = get_store().get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if get_settings().evidence_provider != "earthengine":
        return {"layers": {}}
    health_year = year if year is not None and 2017 <= year <= 2025 else None
    cache_key = f"{report_id}:{health_year or 'latest'}"
    hit = _LAYER_CACHE.get(cache_key)
    if hit and time.time() - hit[0] < 2 * 3600:  # Earth Engine tile URLs expire after a few hours
        return {"layers": hit[1]}
    from app.tools.earthengine import map_layers

    s1 = report.evidence.s1 if report.evidence else None
    flood = s1.event if s1 and s1.flooded_fraction_aoi >= 0.03 else None
    layers = map_layers(
        report.location.lat,
        report.location.lng,
        report.radius_m,
        flood,
        health_year,
        report.location.geometry,
    )
    _LAYER_CACHE[cache_key] = (time.time(), layers)
    return {"layers": layers}


@app.get("/api/examples")
def examples() -> list[dict]:
    demo = get_settings().evidence_provider == "mock"
    return [{**e, "demo_data": demo} for e in (EXAMPLES if demo else REAL_EXAMPLES)]


@app.post("/api/reports", response_model=Report)
def create_report(req: ReportRequest) -> Report:
    # Sync handler: runs in the threadpool, so progress polling stays responsive.
    store = get_store()
    if req.report_id and (existing := store.get(req.report_id)):
        return existing
    report = new_report(req)
    store.save(report)
    return run_report(req, report)


@app.get("/api/reports/{report_id}", response_model=Report)
def get_report(report_id: str) -> Report:
    return _finished_or_404(report_id, require_done=False)


@app.post("/api/reports/{report_id}/translate", response_model=Report)
def translate_report(report_id: str, body: TranslateRequest) -> Report:
    report = _finished_or_404(report_id)
    if body.lang != "en" and body.lang not in report.translations:
        _require_agent()
        report.translations[body.lang] = translate.translate(report, body.lang)
        get_store().save(report)
    return report


@app.post("/api/reports/{report_id}/ask", response_model=AskResponse)
def ask(report_id: str, body: AskRequest) -> AskResponse:
    report = _finished_or_404(report_id)
    _require_agent()
    return qa.answer(report, body.question, body.lang)


@app.post("/api/reports/{report_id}/brochure", response_model=BrochureResponse)
async def brochure_check(report_id: str, file: UploadFile) -> BrochureResponse:
    report = _finished_or_404(report_id)
    _require_agent()
    if file.content_type not in BROCHURE_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, WebP or PDF")
    data = await file.read(MAX_BROCHURE_BYTES + 1)
    if len(data) > MAX_BROCHURE_BYTES:
        raise HTTPException(status_code=413, detail="File is larger than 10 MB")
    claims = await run_in_threadpool(brochure.check, report, data, file.content_type)
    return BrochureResponse(claims=claims)


@app.post("/api/reports/{report_id}/actions", response_model=ActionKit)
def action_kit(report_id: str) -> ActionKit:
    report = _finished_or_404(report_id)
    if report.actions is None:
        report.actions = actions.build(report, use_gemini=llm.agent_enabled())
        get_store().save(report)
    return report.actions


@app.post("/api/reports/{report_id}/alternatives", response_model=AlternativesResponse)
def nearby_alternatives(report_id: str) -> AlternativesResponse:
    return alternatives.find(_finished_or_404(report_id))


@app.post("/api/compare", response_model=CompareResponse)
def compare_reports(body: CompareRequest) -> CompareResponse:
    reports = [_finished_or_404(i) for i in dict.fromkeys(body.report_ids)]
    if len(reports) < 2:
        raise HTTPException(status_code=422, detail="Pick at least two different reports")
    return compare.compare(reports, use_gemini=llm.agent_enabled())


def _locality(lat: float, lng: float, label: str, radius_m: int) -> LocalityReport:
    try:
        return get_locality_report(lat, lng, label, radius_m)
    except AmenitiesUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/locality", response_model=LocalityReport)
def locality_report(body: LocalityRequest) -> LocalityReport:
    return _locality(body.lat, body.lng, body.label, body.radius_m)


@app.post("/api/locality/commute", response_model=CommuteReport)
def locality_commute(body: CommuteRequest) -> CommuteReport:
    try:
        return get_commute_report(body.origin_lat, body.origin_lng, body.destinations)
    except RoutesUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/locality/air", response_model=AirQualityReport)
def locality_air(lat: float, lng: float) -> AirQualityReport:
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        raise HTTPException(status_code=422, detail="Invalid coordinates")
    try:
        return get_air_quality_report(lat, lng)
    except AirQualityUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/locality/air/tiles/{zoom}/{x}/{y}")
def locality_air_tile(zoom: int, x: int, y: int) -> Response:
    try:
        return Response(
            content=get_heatmap_tile(zoom, x, y),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except AirQualityUnavailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/locality/neighborhood-health", response_model=NeighborhoodHealth)
def locality_neighborhood_health(lat: float, lng: float) -> NeighborhoodHealth:
    if not -90 <= lat <= 90 or not -180 <= lng <= 180:
        raise HTTPException(status_code=422, detail="Invalid coordinates")
    try:
        return get_neighborhood_health(lat, lng)
    except NeighborhoodHealthUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/reports/{report_id}/locality", response_model=LocalityReport)
def report_locality(report_id: str) -> LocalityReport:
    report = _finished_or_404(report_id, require_done=False)
    return _locality(
        report.location.lat,
        report.location.lng,
        report.location.label or f"Plot at {report.location.lat:.4f}, {report.location.lng:.4f}",
        2500,
    )


# ---------- address search (Google Places; the key never leaves the server) ----------

@app.get("/api/places/autocomplete")
def places_autocomplete(q: str, session: str, lat: float | None = None, lng: float | None = None) -> list[dict]:
    if len(q.strip()) < 3:
        return []
    try:
        return places.autocomplete(q.strip()[:120], session[:64], lat, lng)
    except places.PlacesUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/places/{place_id}")
def place_details(place_id: str, session: str) -> dict:
    try:
        return places.place_location(place_id, session[:64])
    except places.PlacesUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _finished_or_404(report_id: str, require_done: bool = True) -> Report:
    report = get_store().get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if require_done and (report.status not in ("done", "partial") or report.evidence is None):
        raise HTTPException(status_code=409, detail="Report is not finished yet")
    return report


def _require_agent() -> None:
    if not llm.agent_enabled():
        raise HTTPException(status_code=503, detail="AI features are not configured on this server")


# Serve built frontend directly from FastAPI if dist/ exists
DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        if full_path.startswith("api/") or full_path in ("healthz", "docs", "openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        target = DIST_DIR / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST_DIR / "index.html")
