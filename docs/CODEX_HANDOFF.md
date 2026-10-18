# SAMPAAA: handoff plan for Codex

Last updated: 16 Oct 2026 (by Claude). Owner: Aditya and team.
Read `AGENTS.md` first. Its rules override anything here.

**Contents**
0. Current state: what exists and what is real
1. Decisions already made (don't re-open)
2. Data reliability review and better Google data
3. Priority plan and sequencing
4. Spec A: insight-first report restructure
5. Spec B: draw your own boundary (polygon AOI)
6. Spec C: Land Health lens (vegetation and other indices)
7. Spec D: Urban Life lens (locality upgrade)
8. Spec E: Business / Site Intelligence (later; reality check included)
9. Deployment checklist (Cloud Run)
10. Known issues backlog
11. Definition of done for every task

---

## 0. Current state

**Repo:** `landlens-new/` is the source of truth. The older `landlens/` folder is outdated.
- Branch: `hybrid-design`.
- **Much of the latest work is uncommitted.** First step, before anything else:

```bash
cd landlens-new && git switch -c real-data && git add -A && git commit -m "Real data: Earth Engine provider, Google tiles, Places search, grounded locality"
```

**Run locally**

```bash
cd backend && uv run uvicorn app.main:app --port 8090 --reload --reload-exclude '.cache/*'
cd frontend && npx vite --port 5173
```

**Google Cloud:**
- Project ID `project-d93e9973-be54-470e-81d` ("My First Project"), on the Free Trial: ₹28,797 of
  credits, expires 15 Jan 2027.
- Don't click "Upgrade"; the Free Trial cannot charge the card.
- Budget alert: ₹4,000.
- Earth Engine is registered as **non-commercial, Community tier** (150 EECU-h/month, no billing).
  If SAMPAAA becomes a paid product, it needs a commercial Earth Engine licence.
- Enabled APIs: Vertex AI, Earth Engine, Places (New), Geocoding, Map Tiles, Routes, Cloud Run,
  Cloud Build, Artifact Registry, API Keys.
- Local auth is `gcloud auth application-default login` (account ramkandalkar.iitb@gmail.com), with
  the quota project set.

**Keys** (values never in git):

| Env var | File | Restricted to |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | `backend/.env` | Places + Geocoding, server side |
| `VITE_GOOGLE_MAPS_KEY` | `frontend/.env.local` | Map Tiles, referrer `http://localhost:5173/*` only; add the Cloud Run URL at deploy |
| `GEMINI_API_KEY` | `backend/.env` | Old AI Studio key, backup only |

Also in `backend/.env`: `USE_VERTEX=true`, `GCP_PROJECT=…`, `GCP_LOCATION=global`,
`EVIDENCE_PROVIDER=earthengine`.

### What's real vs not

| Area | Status | Source |
|---|---|---|
| Gemini (agent, verdict, Q&A) | ✅ real | Vertex AI `gemini-3.8-flash`, fallbacks 3.6/3.5 |
| Water history 1984–2021 | ✅ real | JRC GSW v1.4 (occurrence, transition, Yearly/MonthlyHistory) |
| Monthly water 2022–2025 | ✅ real | Dynamic World labels |
| Land cover 2016–2025 | ✅ real | Dynamic World (yearly mode composite) |
| Monsoon water on plot | ✅ real | Dynamic World Jun–Nov scenes (India-specific window) |
| Terrain (HAND, relative height) | ✅ real | MERIT Hydro (90 m) |
| Rain | ✅ real | CHIRPS daily 2015–2024 |
| Change score | ✅ real | AlphaEarth Satellite Embedding |
| Radar flood check (agent drill-down) | ✅ real, weak in cities | Sentinel-1 VV change detection |
| Map overlays | ✅ real | Earth Engine `getMapId` tiles via `/api/reports/{id}/layers` |
| Basemap | ✅ real | Google Map Tiles API (satellite + dark roadmap) through a MapLibre custom protocol |
| Address search | ✅ real | Places Autocomplete (New) via `/api/places/*`; Photon backup |
| Locality amenities | ✅ real | Places Nearby (New), 6 categories; Overpass backup; never invented |
| Locality opinions | ✅ real | Gemini + Google Search grounding, real source links + search chip |
| Satellite photo "vision" notes | ❌ off | `Evidence.vision` empty for real reports (no pipeline yet) |
| Local news | ❌ off | `local_news()` returns [] (no source yet; candidate: Search grounding) |
| Report storage | ⚠️ memory | Lost on restart. Use Firestore on Cloud Run (`STORE=firestore`) |

### Real demo examples (`REAL_EXAMPLES` in `backend/app/main.py`)
- Seasonal wetland layout, 13.10094, 77.64956: High
- Bellandur lake edge, 12.9330, 77.6610: High
- Basavanagudi control, 12.9425, 77.5737: Low on every check
- Jakarta, −6.1505, 106.8005: High (terrain)

## 1. Decisions already made (don't re-open)
- **The map stays MapLibre** with Google tiles; we don't use the Google Maps JS SDK. The required
  Google logo and live copyright line are rendered in `MapCanvas.tsx`.
- **Google Places data shows on a Google basemap** (terms). Cache it for 24 h at most.
- **Charts:** story line, month calendar, streamgraph, dial. No bars or pies.
- **The locality score uses measured distances and counts only** (weights 30/30/20/20). Sentiment
  is shown, never scored. Nearest-place cards require 10+ Google reviews (transit exempt), and
  "metro" means subway or light rail only.
- **Reddit scraping was removed** (terms). Don't add scraping of any site.
- **Demo mode stays available** for offline UI work.

## 2. Data reliability review

Overall, the sources are credible and peer-reviewed or official. The problems are **resolution**,
**recency** and **city blind spots**. Recommended upgrades, all free in Earth Engine unless noted:

| Signal | Now | Weakness | Upgrade | Priority |
|---|---|---|---|---|
| Elevation / low-lying | MERIT Hydro HAND, 90 m | Too coarse for one plot; one 90 m cell can span a whole layout | **FABDEM 30 m** (`projects/sat-io/open-datasets/FABDEM`, buildings and trees removed) or **Copernicus GLO-30** (`COPERNICUS/DEM/GLO30`). Compute a local relative-depression score (plot vs 500 m and 2 km neighbourhood percentile). Keep MERIT HAND as the regional drainage signal. | High |
| Water history | JRC GSW v1.4, 30 m, ends 2021 | Misses ponds under ~30 m and cloudy monsoon months; stops in 2021 | Keep JRC for 1984–2021. For 2017+ add a **Sentinel-2 MNDWI** time series (Cloud Score+ masked) and **Sentinel-1** water for cloudy months. | High |
| Land cover | Dynamic World yearly *mode* | Year-to-year label noise (a park "lost" 5 points of trees) | Use the **mean class probability** per year instead of the mode label. Compare 2-year windows (2016–17 vs 2024–25). Optionally cross-check with ESA WorldCover 2021. | High (cheap) |
| Built-up growth | Dynamic World "built" | 10 m label, noisy | **Google Open Buildings 2.5D Temporal** (`GOOGLE/Research/open-buildings-temporal/v1`): yearly building presence and height 2016–2023 for India and the Global South. Strongest Google-native "when was this built" signal. | High |
| Flood events | Sentinel-1 drill-down | Misses most city floods (double bounce, 12-day revisit) | Add the **Global Flood Database** (`GLOBAL_FLOOD_DB/MODIS_EVENTS/V1`, 2000–2018 events), **WRI Aqueduct flood hazard** (`WRI/Aqueduct_Flood_Hazard_Maps/V2`, return periods), and news via Search grounding (real links only). Google **Flood Hub** API is by application; apply, but don't depend on it. | High |
| Rain | CHIRPS 5.5 km | Regional, not plot-level; 64.5 mm/day rarely reached at 5.5 km | Keep (honest regional context). Optionally add GPM IMERG for extreme events. Rain never drives the overall rating (already enforced). | Low |
| Monsoon window | Jun–Nov hard-coded | Wrong outside India (Jakarta wet season is Dec–Mar) | Pick the wet season per location from the CHIRPS climatology (the 6 wettest months). | Medium |
| Change score | AlphaEarth embeddings | Not interpretable on its own | Keep as a supporting "something changed" signal only. | Low |
| Heat | none | none | **Landsat 8/9 surface temperature** (C2 L2 ST band, 30 m display); MODIS LST 1 km for trend. | Medium (Spec C/D) |
| Air quality | none | none | **Google Air Quality API** (current, 30-day history, heatmap tiles) for the urban lens; Sentinel-5P NO₂ for long-term trend. | Medium (Spec D) |
| Population / growth | none | none | WorldPop 100 m, GHSL built surface (`JRC/GHSL/P2023A/GHS_BUILT_S`), Open Buildings Temporal counts. | Spec E |

**Important limit:** Google Earth / Google Maps imagery is **not live**. It's a mosaic that is
months to years old. Google Maps Platform terms **forbid** running analysis or ML on Google Maps
imagery. Analysis must use Earth Engine datasets (Sentinel/Landsat/etc.) or licensed commercial
imagery. This matters for Spec E.

## 3. Priority plan

The submission deadline is **18 Oct 2026**, so be ruthless.

| Phase | When | Do |
|---|---|---|
| **P0: before submission** | 16–18 Oct | (1) Spec A report restructure (Overview only). (2) Data quick wins: Dynamic World mean probabilities + 2-year windows; seasonal window from climatology if time allows. (3) Deploy (section 9). (4) Demo video on the real examples. |
| **P1: before finale** | by mid-Nov | Spec B polygon drawing. Spec C Land Health (NDVI, MNDWI, NDBI, NDMI + heat). Data upgrades: FABDEM relative height, Open Buildings Temporal, Global Flood DB + Aqueduct. |
| **P2: finale polish** | by 4 Dec | Spec D Urban Life (commute times, air quality, heat, green cover). Pitch story: "Land → Life". |
| **P3: after** | 2027 | Spec E Business / Site Intelligence (needs commercial imagery and a commercial Earth Engine licence). |

**Recommended focus for the two new use cases:**
- **Land Health (C):** reuses the same Earth Engine pipeline, strengthens the core story, cheap.
- **Urban Life (D):** builds on the locality lens we already have.
- **Business (E):** later, reframed as *site intelligence*. See section 8 for why counting cars is
  not feasible yet.

## 4. Spec A: insight-first report restructure (P0)

**Problem:** the Overview always opens with "40 years of this land" (water chart) and the monthly
water grid. For most plots water is a non-story, so the top of the report is an empty chart.

**Principle:** lead with *what matters for this plot*, show *what we checked and found fine* in
compact form, and keep the full charts in Evidence.

### New Overview order
1. **Verdict header** (keep as is): headline, risk pill, "N of M facts checked", advice line.
2. **"What stands out"**: 1–3 *signal cards*, ranked by salience (below). Each card has:
   - a one-line finding (from the verified findings, not new text)
   - a mini visual chosen by signal type
   - a "Show on map" action that switches on the matching layer
   - citation chips
3. **"Checked and clear"**: one compact row per dimension that came back low, e.g. "✓ No water on
   this land in 40 years · JRC 1984–2021", "✓ 12 m above the nearest drain · MERIT Hydro". Dense,
   reassuring, and it shows the breadth we checked.
4. **"What changed here"**: the adaptive land story. Pick the strongest change signal:
   - water lost → the existing `StoryChart`
   - built-up grew → `LandStream` (streamgraph)
   - greenery lost → NDVI story line (Spec C)
   - nothing changed → one sentence ("Land use has been stable since 2016").
5. **Can't tell you**: limitations (existing `CantTellYou`).

Move `WaterCalendar` and the full `StoryChart` to **Evidence → Water**, and show them only when
there is any water signal (`max water share ≥ 2%` or `monsoon.seen` not empty). Otherwise Evidence →
Water shows the "checked and clear" sentence.

### Salience (deterministic; implement in `frontend/src/lib/salience.ts`, unit-testable)
For each dimension in `report.ratings`:

```
score = levelWeight[rating.level] * confidenceWeight[rating.confidence] + novelty
levelWeight      = { high: 4, elevated: 3, moderate: 2, low: 0 }
confidenceWeight = { high: 1.0, medium: 0.8, low: 0.6 }
novelty          = +0.5 if the dimension has a rating_change from the agent (corroborated)
                   +0.3 if it has a "concern" finding
```

Rules:
- Cards show dimensions with `score ≥ 1.2`, top 3, ties broken in the order water_body → flood →
  terrain → green → rain.
- Rain never gets a card unless it's the only non-low dimension (it is regional).
- If no dimension qualifies, show a single green card: "No red flags in the records we checked"
  plus the strongest "checked and clear" facts.

### Mini visual per card type
- `water_body`: StoryChart sparkline
- `flood`: flood-year marker on a 10-year strip
- `terrain`: RiskDial-style relative-height gauge ("lower than 81% of land within 2 km")
- `green`: LandStream mini
- `rain`: single stat

Reuse the `questions.tsx` viz components (`WaterViz`, `FloodViz`, `TerrainViz`, `GreenViz`,
`RainViz`) where possible.

**Acceptance:**
- Basavanagudi (control): no water chart on Overview, one green card, a "Checked and clear" list.
- Wetland example: water and terrain cards first.
- Bellandur: water, flood, terrain.
- Typecheck passes; add `salience.test` (vitest if added, or a pure-TS function checked with a
  backend-agnostic test harness).

## 5. Spec B: draw your own boundary (P1)

**Goal:** besides the radius circle, let users trace the plot point by point (like Google Earth),
or import a boundary file.

### Frontend
- **Library:** `terra-draw` + `terra-draw-maplibre-gl-adapter` (supports MapLibre v5/6; pin exact
  versions). Modes: polygon, select/edit vertices, delete.
- **Inspector:** "Shape: ◯ Circle | ⬠ Draw boundary | ⇪ Import KML/GeoJSON".
  - Show the live area (m², acres, guntas for India: 1 gunta = 101.17 m²) and perimeter
    (`@turf/area`, `@turf/length`).
- **Import:** `.kml` (Google Earth export) and `.geojson`. Parse KML with `@tmcw/togeojson`.
  - Take the first Polygon/MultiPolygon.
  - Reject over 200 vertices after simplification (`@turf/simplify`).
- **Validation (client and server):** area 200 m² – 2 km², no self-intersection (`@turf/kinks`),
  closed ring.
- The analysis ring on the map follows the polygon (replace the `aoi` circle source).

### Backend
- `ReportRequest.geometry: dict | None` (a GeoJSON Polygon). When set, `radius_m` is ignored.
  Validate with shapely, which is already available through Earth Engine deps (if not, add
  `shapely`).
- `Report.location.geometry` is stored for display, compare and print.
- `earthengine.py`: replace `_areas(lat, lng, radius_m)` with `_areas(req)`:
  - `aoi` = the polygon
  - `core` = the polygon itself (the plot *is* the drawn shape)
  - `context` = the polygon buffered by 250 m, for "nearby" signals
  - Cache keys use a SHA-256 of the normalised geometry, rounded to 6 decimals.
- Evidence "area" wording switches from "inside the circle" to "inside your boundary". The
  frontend reads `report.location.geometry ? "boundary" : "circle"`.
- `quick()` / alternatives keep using circles around candidate points.

**Acceptance:**
- Draw a 4-point plot, run a report: the evidence matches that shape, and the map layers are
  clipped to it.
- Import a Google Earth KML: identical result.
- Invalid shapes give a clear error message.

## 6. Spec C: Land Health lens (P1)

**Pitch:** "How healthy is this land, and is it getting better or worse?" Useful for plot buyers
(greenery loss, heat, waterlogging) and farmland buyers (crop vigour, irrigation, seasonality).

### Indices (Sentinel-2 SR Harmonized, Cloud Score+ `cs_cdf ≥ 0.6`, 2017–present; Landsat C2 L2 harmonised for 1990–2016 where needed)

| Index | Formula (S2 bands) | Insight | Show as |
|---|---|---|---|
| NDVI | (B8−B4)/(B8+B4) | Green cover and vigour | Story line, yearly median + seasonal band |
| MNDWI | (B3−B11)/(B3+B11) | Open water / wetness | Complements JRC after 2021 |
| NDBI | (B11−B8)/(B11+B8) | Built-up intensity | Pairs with Open Buildings |
| NDMI | (B8−B11)/(B8+B11) | Moisture; persistent waterlogging | Monsoon vs dry-season gap |
| BSI | ((B11+B4)−(B8+B2))/((B11+B4)+(B8+B2)) | Bare or cleared soil (construction start) | Event markers |
| LST | Landsat 8/9 ST_B10 → °C | Heat island | "X °C hotter than surroundings in May" |

### Analytics (backend, deterministic, all numbers go into Evidence so the verifier can check them)
- `land_health.by_year[YYYY] = {ndvi_median, ndvi_p10, ndvi_p90, ndmi_dry, ndmi_wet, ndbi_median, lst_may_c}`
- **Trend:** Sen's slope with a Mann–Kendall p-value over yearly medians. Call it a trend only if
  p < 0.05 and there are at least 6 years.
- **Seasonality:** monthly NDVI climatology (amplitude = crop or seasonal vegetation).
- **Relative context:** the plot's value vs the percentile of the 2 km neighbourhood ("greener than
  64% of land around").
- **Rules (new dimension `land_health`):**
  - NDVI trend ≤ −0.02/yr (significant) and loss ≥ 0.1 → elevated
  - LST ≥ 3 °C above the neighbourhood median → moderate
  - etc. Keep thresholds in `rules.py` with comments citing the reasoning.

### UI
- New **Evidence → Land health** section and an Overview signal card when salient.
- Map layers: NDVI (green ramp), LST (heat ramp), via the existing `/layers` endpoint plus a year
  selector bound to the TimelineScrubber.
- **Farmland mode** (toggle in Inspector: "This is farmland"): shows crop seasons detected from the
  NDVI climatology (number of peaks per year = cropping intensity), irrigation proxy (dry-season
  NDVI), and years with failed seasons (anomaly < −1.5σ).

### Cost
Earth Engine only, cached. Compute S2 index composites per year with `reduceRegion` over the AOI,
not per scene where avoidable.

**Acceptance:**
- Basavanagudi: stable NDVI, no card.
- Wetland example: NDVI/NDBI trend consistent with Dynamic World built growth.
- Verifier accepts the `land_health.*` paths.
- Tests for the trend math (pure Python).

## 7. Spec D: Urban Life lens (P2), upgrading the locality lens

Already done: real amenities, metro rule, measured score, grounded opinions with sources.

### Add, in order
1. **Commute:** the user adds up to 3 places (office, school, parents).
   - Routes API `computeRouteMatrix` for DRIVE (TRAFFIC_AWARE_OPTIMAL at Mon 9:00 local) and
     TRANSIT.
   - Show minutes and the peak vs off-peak gap.
   - Server key needs `routes.googleapis.com` added to its restrictions.
2. **Air:** Google **Air Quality API**: current AQI (Indian NAQI where available) + 30-day history,
   dominant pollutant. Plus a Sentinel-5P NO₂ multi-year trend for context. Heatmap tiles as an
   optional map layer.
3. **Heat and green:** reuse Spec C (LST, NDVI) at 1 km neighbourhood scale ("This neighbourhood is
   2.1 °C hotter than the city median in May").
4. **Flood context for the whole locality:** the share of the 1 km area with JRC water or
   Aqueduct hazard. Links Land → Life.
5. **"My priorities":** user weights (commute, schools, green, quiet). The score recomputes
   client-side from the sub-indices. The default weights stay as today.
6. **Compare localities:** reuse the Compare tray; two or three localities side by side.

### Rules
- Opinions are never scored.
- Every metric shows its source and timestamp.
- No crime or safety scores (no reliable open data; avoid harm).

## 8. Spec E: Business / Site Intelligence (P3, reality check first)

**The idea:** count cars in a Walmart parking lot from satellite images to estimate footfall.
**Reality check:**
- **Google Earth / Maps imagery can't be used.** It isn't live (months to years old), and the terms
  forbid analysing it.
- **Free satellites are too coarse for cars.** Sentinel-2 is 10 m, Landsat 30 m, and a car is about
  2×4.5 m.
- **Car counting needs commercial very-high-resolution imagery** with 30–50 cm pixels:
  - Maxar or Vantor, Airbus Pléiades Neo, Planet SkySat
  - available through UP42, SkyWatch or Planet's API
  - costs roughly $10–25/km² per image, and revisits aren't daily for a given store
  - Hedge funds do exactly this (RS Metrics, Orbital Insight), so it's proven but expensive.
  - PlanetScope (3 m, daily) gives only a coarse "lot fullness" index, not counts.
- It also needs a commercial Earth Engine licence and legal review per data provider.

**What we can build with Google and free data (stronger, cheaper): "Site Intelligence"**

| Question | Signal | Source |
|---|---|---|
| Is this area growing? | New buildings per year, building height growth | Open Buildings 2.5D Temporal (2016–2023), GHSL, Dynamic World built |
| How many people live within 5/10/15 min? | Population inside a drive-time area | WorldPop 100 m × Routes API (isochrone by sampling a grid with computeRouteMatrix) |
| Who competes nearby? | Competitor count, ratings, review volume | Places Nearby/Text Search (24 h cache) |
| Economic activity trend | Night lights brightness trend | VIIRS monthly (`NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG`), area-level only |
| Construction pipeline | Cleared land (BSI spikes), new built-up | Sentinel-2 + Dynamic World |
| Site risk | Flood, heat, low-lying | Our existing land report |

Product: **"Where should we open the next store / clinic / school?"** Score candidate sites inside a
city. This reuses ~70% of SAMPAAA and needs no commercial imagery.

Car or footfall counting becomes a paid add-on later, through a commercial imagery partner.

**Other ideas worth considering**
- **Lender / insurer API:** batch land-risk reports for mortgage underwriting. Same engine, B2B.
- **RERA project check:** compare a developer's project boundary against water history and lake
  buffer zones (Bengaluru lake buffer rules), using drawn or imported boundaries (Spec B).
- **Before-you-rent:** the locality lens plus a waterlogging-prone-street signal for renters during
  the monsoon.

## 9. Deployment checklist (Cloud Run)

1. **Dockerfile:**
   - build the frontend (`npm ci && npm run build`)
   - serve `frontend/dist` from FastAPI (the catch-all already exists)
   - Python 3.12 slim, `uv sync --frozen`
2. **Service account `sampaaa-run@…`**, with roles:
   - Vertex AI User
   - Earth Engine Resource Viewer + Service Usage Consumer (register it for Earth Engine)
   - Datastore User (Firestore)
   - Secret Manager Secret Accessor
3. **Secrets:** put `GOOGLE_MAPS_API_KEY` in Secret Manager and mount it as an env var. The browser
   key is baked at build time (`VITE_GOOGLE_MAPS_KEY` build arg).
4. **Env:** `USE_VERTEX=true`, `EVIDENCE_PROVIDER=earthengine`, `STORE=firestore`, `GCP_PROJECT`,
   `CORS_ORIGINS=["https://<run-url>"]`.
5. **Earth Engine cache:** the local disk cache is per instance and ephemeral on Cloud Run. Move it
   to Firestore or GCS (same key scheme) before relying on it in production.
6. **Deploy:** `gcloud run deploy sampaaa --region asia-south1 --min-instances 0 --max-instances 3 --cpu 1 --memory 1Gi --timeout 120`
7. **Browser key:** add `https://<run-url>/*` to its allowed referrers.
8. **Smoke test:**
   - the four examples
   - one Places search
   - one locality report
   - check the budget page the next day

## 10. Known issues backlog
- Report store is in memory; reports vanish on API restart. Use Firestore.
- StoryChart: first-year tick overlaps "1990" when data starts at 1984/88 (seen as "19801990").
- In the LocalitySheet header, very long Google addresses wrap to 3 lines; truncate with a
  title tooltip.
- `Evidence.vision` and `news` are empty in real mode. Options:
  - Gemini vision on Sentinel-2 RGB yearly thumbnails (`getThumbURL`), with strict
    "water_visible / construction_stage" outputs and verifier support
  - news through Search grounding with real links only
- `quick()` alternatives scan in real mode costs 3 Earth Engine queries per point. Check the
  alternatives count and cache.
- Dynamic World mode composites are noisy (see section 2). Fix in P0.
- Monsoon window is India-specific (see section 2).
- `frontend/package.json` contains `@rolldown/binding-darwin-arm64`, which is macOS-only and breaks
  the Linux Docker build. Remove it before the Dockerfile.
- `__pycache__` folders and `tsconfig.tsbuildinfo` should be git-ignored.

## 11. Definition of done (every task)
- [ ] Follows `AGENTS.md`; no invented data; demo mode labelled.
- [ ] New evidence fields are verifier-resolvable and appear in "Can't tell you" with resolution and
      period.
- [ ] `cd backend && uv run pytest -q` passes; new logic has hermetic tests.
- [ ] `cd frontend && npx tsc -b --noEmit` passes.
- [ ] Checked in the browser on: the wetland example, the Basavanagudi control, and one user-drawn
      or searched address.
- [ ] Cost note in the PR/commit message if the change adds a paid API call (calls per report × price).
