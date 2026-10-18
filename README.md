# Landsight

**Every place has a history. Now, you can read it.**

Landsight is satellite-powered due diligence for land buyers, home buyers, planners and small developers. Search for a plot, drop a pin, draw its boundary or import KML/GeoJSON. Landsight turns decades of public Earth observation into a plain-language report about historical water, wet-season flooding, terrain, land-cover change and land health. It also offers a separate **Locality Lens** for nearby amenities and source-linked community opinion.

Built for the **Google Cloud AI Builder Cup 2026** · Sustainability & Social Impact.

## Live demo

**[Open Landsight](https://sampaaa-130242409804.asia-south1.run.app/)**

The landing page has four one-click examples:

1. **New layout on a seasonal wetland · North Bengaluru** — the strongest water-history story.
2. **Plots beside Bellandur Lake · Bengaluru** — a lakeside urban plot.
3. **Established high ground · Basavanagudi, Bengaluru** — a useful contrast with the wetland example.
4. **Low-lying district · Jakarta** — an international low-lying urban case.

Click any example and wait for the live evidence and Gemini investigation to finish. You can also search an address, choose **Draw / import**, and either draw the plot on the map or import a KML/GeoJSON polygon. Switch to **Locality & Life** to see amenities, a transparent liveability score and grounded community sources.

Live reports usually take roughly 30–90 seconds because Landsight queries Earth Engine and runs verification in real time.

## What Landsight does

- Reconstructs surface-water history from 1984 onward and highlights seasonal or former water presence.
- Selects the six locally wettest months from CHIRPS climatology, checks those seasons, and uses Sentinel-1 radar for flood follow-up through cloud cover.
- Compares 30 m FABDEM plot height with 500 m and 2 km neighbourhoods, retaining MERIT HAND only as regional drainage context.
- Shows when buildings were first detected in Google Open Buildings 2.5D Temporal data, without presenting detection as an exact construction date.
- Cross-checks flood evidence against the Global Flood Database event archive and WRI Aqueduct's coarse regional hazard model.
- Compares two-year Dynamic World probability windows to show built-up and green-cover change without relying on a single mode label.
- Tracks NDVI, MNDWI, NDBI, NDMI and May land-surface temperature, with plot-versus-neighbourhood context.
- Accepts a radius, a hand-drawn polygon, KML or GeoJSON so evidence follows the actual plot.
- Ranks the most important findings first, verifies every generated claim against the evidence pack, and keeps clear results compact.
- Finds nearby transit, groceries, healthcare, schools, dining and parks in a separate Locality Lens, with optional commute, air-quality, and 1 km neighbourhood heat/green checks.

Landsight helps a buyer understand what to investigate next. It is not a replacement for title verification, a lawyer, a surveyor, a drainage engineer or a site visit after heavy rain.

## How it works

```text
search / pin / boundary
          │
          ▼
FastAPI evidence fan-out ──► Google Earth Engine datasets (parallel + cached)
          │
          ▼
transparent rules ──► baseline ratings + confidence
          │
          ▼
Gemini on Vertex AI + Google ADK investigator tools
          │
          ▼
structured writer ──► citation/number/policy verifier ──► Firestore report
          │
          ▼
React report + Earth Engine map layers
```

The rules engine owns the baseline ratings. Gemini decides which bounded follow-up checks to run and explains the evidence; it cannot silently invent measurements. The verifier rejects missing citations, unsupported numbers, future predictions and legal-title claims. If Gemini is unavailable or its output fails verification, deterministic fallback findings keep the report usable.

Locality Lens follows a separate path: Google Places and Geocoding provide nearby places and neighbourhood context; a deterministic distance/count formula produces the score; Gemini with Google Search grounding summarises community opinion with its source pages. Users can explicitly ask Google Routes for future Monday driving and transit estimates to chosen destinations. Opinions and commute estimates never affect the score.

## Google technology used

- **Google Earth Engine** for live geospatial analysis and map layers. The collections include JRC Global Surface Water, Dynamic World, Sentinel-1 GRD, Sentinel-2 SR Harmonized with Cloud Score+, Sentinel-5P NO₂, Landsat 8/9 Collection 2, FABDEM, MERIT Hydro, CHIRPS Daily, Google Open Buildings 2.5D Temporal, Global Flood Database, WRI Aqueduct Flood Hazard Maps and AlphaEarth annual satellite embeddings.
- **Gemini on Vertex AI** for structured findings, report writing, follow-up answers, translations, next steps and grounded locality summaries.
- **Google Agent Development Kit (ADK)** for the bounded investigator agent and its evidence tools: local wet-season inspection, radar flood checks and year-specific land cover.
- **Google Search grounding** for source-linked Community Voices in Locality Lens.
- **Google Places API (New)** for autocomplete, place details and nearby amenities.
- **Google Routes API** for explicit, user-selected driving and transit commute estimates.
- **Google Air Quality API** for explicit current local AQI, 30-day history, pollutant concentrations and an optional current heatmap.
- **Google Geocoding API** for neighbourhood-aware reverse geocoding.
- **Google Map Tiles API** for satellite and dark-road basemaps.
- **Cloud Run** for the containerised React/FastAPI application.
- **Firestore** for reports and the shared Earth Engine result cache across Cloud Run instances.
- **Secret Manager** for server and browser map credentials used during runtime/build deployment.

## Run locally

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 20+ and npm.

### Quick start with hermetic demo data

This mode needs no cloud credentials.

```bash
git clone <your-fork-or-repository-url>
cd landlens-new

cd backend
uv sync
EVIDENCE_PROVIDER=mock STORE=memory USE_AGENT=false \
  uv run uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

In a second terminal:

```bash
cd frontend
npm ci
LANDLENS_API=http://localhost:8090 npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Without `VITE_GOOGLE_MAPS_KEY`, the map uses its fallback basemap.

### Run with real Google services

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`.
2. Configure a Google Cloud project registered for Earth Engine and authenticate locally with Application Default Credentials.
3. In the backend configuration, use `EVIDENCE_PROVIDER=earthengine`, set `GCP_PROJECT`, and enable Vertex AI or provide local Gemini credentials.
4. Add a server-restricted `GOOGLE_MAPS_API_KEY` for Places, Geocoding, Routes and Air Quality. For Google basemaps, expose a browser-referrer-restricted key as `VITE_GOOGLE_MAPS_KEY`.
5. Keep `STORE=memory` for a single local process, or use `STORE=firestore` with an accessible Firestore database.

Start the same backend and frontend commands shown above. Never commit either local environment file.

### Checks

```bash
cd backend && uv run pytest -q
cd frontend && npx tsc -b --noEmit
```

## Repository layout

| Path | Purpose |
|---|---|
| `backend/app/tools/earthengine.py` | Earth Engine evidence, custom-boundary AOIs, caching and map layers |
| `backend/app/rules.py` | Transparent risk/land-health ratings and confidence |
| `backend/app/agent/` | ADK investigator, Gemini writers and deterministic fallbacks |
| `backend/app/agent/verifier.py` | Citation, number and policy verification |
| `backend/app/locality/` | Amenities, liveability scoring and grounded community sentiment |
| `backend/app/services/store.py` | In-memory and Firestore report stores |
| `frontend/src/components/report/` | Insight-first report, evidence and land-health views |
| `frontend/src/lib/boundary.ts` | KML/GeoJSON parsing, simplification, validation and measurements |
| `docs/DEMO_SCRIPT.md` | Timed three-minute submission walkthrough |

## Honest limitations

- Landsight describes observed history; it does not predict future floods, temperatures or development.
- It does **not** check title, encumbrances, ownership, zoning, approvals, RERA registration, soil bearing capacity or construction quality.
- FABDEM is a 30 m terrain model, not a site survey. MERIT HAND is 90 m regional drainage context; neither resolves engineered plot grading.
- Open Buildings covers 2016–2023 in supported regions. Its first detection is not an exact construction date, and small or obscured buildings can be missed.
- The Global Flood Database is an event archive for 2000–2018 derived from MODIS at roughly 250 m effective resolution; it misses unmapped and very local floods.
- WRI Aqueduct is a 1 km regional screening model and should not be read as property-level inundation mapping or a forecast.
- CHIRPS rainfall and the six-wettest-month climatology are regional (roughly 5.5 km, 2015–2024), not a rain gauge or local drainage model. Cloud can still reduce optical observations.
- Other satellite pixels are typically 10–30 m. Very small drains, plot-level fill and short events can be missed. Landsat land-surface temperature is surface heat, not air temperature, and the current comparison focuses on May.
- Earth Engine and source datasets have different update schedules. A recent local event may not yet be present.
- Locality amenity distances are straight-line approximations. Optional Google Routes commute times are future estimates for the next Monday at 9:00 am and 2:00 pm local time; traffic and transit schedules can change. Place coverage, categories and opening status depend on Google Places availability.
- Air Quality API conditions are modelled at approximately 500 m and can change hourly; they are not a measurement at the selected building. Sentinel-5P NO₂ is approximately 1.1 km regional column context, not ground-level personal exposure.
- Neighbourhood green and May surface-heat metrics average a 1 km area and compare it with measured land within 5 km. They are not a tree census, citywide benchmark or air-temperature reading.
- Community Voices are grounded summaries of third-party pages, not verified facts, and may be unavailable when too few credible sources are returned.
- Imported boundaries are limited to Polygon geometry, 200 vertices and 200 m²–2 km². MultiPolygon imports use one polygon.
- Live analysis can take 30–90 seconds and depends on external service availability and quota.

Use Landsight as an evidence-backed starting point, then verify important decisions through official records and qualified local professionals.

---

**Future direction:** Landsight's shared geospatial intelligence foundation could later support additional applications such as **Farm Health** and **Site Intelligence**. These are proposed extensions, not capabilities claimed as live in the current demo.
