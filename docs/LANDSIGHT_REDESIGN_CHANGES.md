# Landsight redesign: what changed

Branch: `a-redesign` (nothing committed yet). Frontend only; no backend, data, rules, scores or API contracts were changed.

## 1. Design lab (separate project)
`sampaaa-design-lab/` (outside this repo) holds four clickable design directions built from mock data: A Mission Control, B Atlas, C Orbit, D Dossier. Direction A, with C's home page, was chosen and ported into this app. See `DESIGN_LAB_NOTES.md` in that folder.

## 2. App redesign (Direction A + C's home)

**Design system (`frontend/src/index.css`, `lib/theme.ts`, `index.html`)**
- Dark graphite is the default; light is fully supported. Theme is `data-theme` on `<html>`, remembered in localStorage (`sampaaa.theme`), applied before first paint.
- Tokens follow the UX plan: graphite neutrals, signal-teal accent, existing risk and data palettes kept, new greenery, heat and air colours.

**App shell (`components/shell/`)**
- `NavRail`: 56 px rail (Explore, Saved plots, Compare, History, How it works, theme). Becomes a bottom bar on phones. Saved, History and Help open as a flyout.
- `TopBar`: breadcrumb plus the existing place search (⌘K or `/` focuses it).
- `MapToolbar`: one vertical group on the right edge: Layers popover, Draw boundary, Basemap, Locate me.
- `CoachMarks`: three dismissible first-run tips (`sampaaa.coach.done`).
- `Hud.tsx`: the full HUD is replaced by one muted telemetry line (`MapReadout`).
- Removed: the emoji lens toggle and the scattered map controls.

**Home (`components/home/HomeOrbit.tsx`)**
- C's home: glowing halo, orbit ring with a travelling satellite, headline "Read the land before you buy it.", a search that lands from above (`CommandSearch` `variant="pill"`), example chips from the API, and a "How it works" row. Globe starts centred at zoom 1.6.

**Plot workspace (`components/workspace/`, `report/ReportSheet.tsx`)**
- One workspace, always on the left (480 px, bottom sheet on phones), with tabs: Summary, Land risk, Land health, Neighbourhood, Ask. `App.tsx` owns the tab; the old Physical Risk / Locality "lens" is now derived from the Neighbourhood tab.
- Passport chips (land risk, land health, neighbourhood score, data date) open their tabs.
- Summary = old Overview; "What should I do?" opens Next steps inside Summary. Land risk = old Evidence minus land health. Land health = land-health panel, land-cover change, building detection and the satellite time machine.
- Before analysis, `PlotWorkspace` shows the same header and tabs with the plot-size controls (`Inspector`, now with an `embedded` mode). The main button reads "Analyse this plot".
- `LocalitySheet` gained an `embedded` mode. Neighbourhood data loads only when its tab is opened and is not refetched for the same plot.

**Neighbourhood map (`components/locality/PlacesOnMap.tsx`)**
- "Places on map" control: a slider per category sets how many of the nearest places are drawn (default 2). Clicking a place, on the map or in a list, opens a details card (category, distance, walking time, rating, source, Google Maps link) and highlights it on the map.

**Layers popover fix**
- Toolbar button styles were leaking into the layer rows; they are now scoped to the toolbar's own buttons.

**Rebrand**
- Product name is now **Landsight** in the UI: tab title, wordmark (also shown top-left on the home page), print pack, share text and report copy. localStorage keys (`sampaaa.*`, `landlens.*`), README, AGENTS.md and backend text are unchanged.

## 3. Tests and tooling
- `scripts/e2e.mjs` updated for the new labels, tabs, and plot position under the workspace panel, plus a new flow for the places limit and place card; the fixture now includes sample places.
- Typecheck and all 7 e2e flows passed at the last full run (before the rename to Landsight, which was typechecked only).
- Local environment: the `frontend/node_modules` quarantine flag was cleared and three native binaries re-signed so Vite starts on macOS.

## 4. Not done
- `/styleguide` route; map place-marker clustering; extra actions in the ⌘K bar; Share and Save in the top bar (they live in the workspace header).
- Light theme and phone width not reviewed by eye. `scripts/smoke.py` and the backend tests were not re-run.

## 5. Other deliverables from this session (outside the repo)
- `~/Desktop/SAMPAAA_AI_Builder_Cup_Deck.pptx` and `SAMPAAA_submission_description.md` for the AI Builder Cup. Team name, leader, GitHub and video links are still placeholders, and the deck still uses the SAMPAAA name.
