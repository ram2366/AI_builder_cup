# SAMPAAA Design Lab: brief for Codex / Claude

Written 17 Oct 2026. Folder: `/Users/yasbodke/Desktop/PERSOMAL/sampaaa-design-lab`

## 0. Goal
Build a **standalone, clickable design lab** that shows **four complete design directions** for
SAMPAAA, with real motion graphics. The owner clicks through all of them, picks one (or mixes
parts), and only then does the chosen design get applied to the real app in `landlens-new`.

**This is a design exploration, not the product:**
- No backend.
- No API keys.
- No changes to `landlens-new`.
- No deploys.

Everything runs locally from mock data:

```bash
cd /Users/yasbodke/Desktop/PERSOMAL/sampaaa-design-lab && npm run dev   # → http://localhost:5180
```

## 1. Context you must read first
- `/Users/yasbodke/Desktop/PERSOMAL/landlens-new/docs/UX_REDESIGN_PLAN.md`
  - **section 2:** the new structure. One plot, one workspace; nav rail, top bar with ⌘K, left
    plot workspace with passport chips and tabs (Summary, Land risk, Land health, Neighbourhood,
    Ask), right-edge map toolbar.
  - **section 3:** the key flows.

  **Every direction below must use this information architecture.** Directions differ in *look,
  layout details and motion*, not in what exists or where it lives.
- `/Users/yasbodke/Desktop/PERSOMAL/landlens-new/AGENTS.md`: product rules that still apply to the
  mock content:
  - every number has a unit and a source chip
  - opinions are labelled as opinions
  - no bar or pie charts
  - plain language first, technical name second, e.g. "Greenery (NDVI)"
- For visual reference, the current app's chart components can be copied and restyled (don't import
  across folders):
  - `landlens-new/frontend/src/components/report/StoryChart.tsx` (40-year water line)
  - `WaterCalendar.tsx` (month grid)
  - `LandStream.tsx` (land-cover streamgraph)
  - `Overview.tsx` `RiskDial`

## 2. Stack (already installed; don't change it)
- Vite 8, React 19, TypeScript 7, Tailwind CSS v4 (`@tailwindcss/vite`), `motion` 14 (animations),
  `lucide-react` (icons only; **no emoji**), `maplibre-gl` 6 (globe).
- **Map imagery:** Esri World Imagery tiles, no key:
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.
  Use a MapLibre globe projection (`projection: { type: "globe" }`) and
  `optimizeDeps.exclude: ["maplibre-gl"]` (already in `vite.config.ts`).
- Don't add other UI frameworks or component libraries. Small utilities are fine if pinned to exact
  versions.
- `npm run typecheck` must pass.

## 3. App structure

```
src/
  main.tsx, App.tsx           # Lab shell: direction switcher + screen switcher
  shared/
    mockData.ts               # the two plots below, typed
    types.ts
    Globe.tsx                 # one MapLibre globe used by every direction (props: plot, mode, overlays, theme)
    charts/                   # StoryLine, MonthGrid, LandStream, Dial, Sparkline, NdviBand: restylable via props/CSS vars
    motion.ts                 # shared timings and easings, with a reduced-motion switch
  designs/
    a-mission/   b-atlas/   c-orbit/   d-dossier/
      theme.css               # this direction's tokens (CSS custom properties)
      Home.tsx  Analysing.tsx  Workspace.tsx  Neighbourhood.tsx  Compare.tsx
```

**Lab shell (always on top, small and unobtrusive, toggled with the `` ` `` key):**
- direction pills A / B / C / D
- screen pills Home / Analysing / Summary / Land risk / Land health / Neighbourhood / Compare
- theme Light / Dark
- plot: Wetland / Basavanagudi
- a "Replay animation" button

Keep the state in the URL hash (e.g. `#b-summary-dark-wetland`) so the owner can share or bookmark
exact screens.

## 4. Mock data (use these real values from the live app; don't invent others)

**Plot 1: "New layout on a seasonal wetland", North Bengaluru (13.10094, 77.64956), 250 m circle, overall HIGH**
- **Ratings:** water_body high, flood high, terrain elevated, land_health low, green low, rain low.
- **Water years** (share of area under water, JRC): high since 1988 (~0.6–0.95 most years), dips
  around 2019–2020.
  - Generate a plausible smooth 1988–2021 series inside those bounds and **label it "illustrative"
    in a code comment.**
- **Flood:** radar flood detected 2022 (Sentinel-1).
- **Monsoon water seen:** 8 of the last 9 years.
- **Built-up:** 7% → 16% (2016–17 vs 2024–25, Dynamic World mean probability).
- **Terrain:** 1.8 m above nearest drain; lower than 85% of land within 2 km.
- **Findings:** 6 of 6 verified. Headline: "Significant history of standing seasonal surface water
  and low drainage elevation".
- **Land health:** greenery stable (no significant trend); May land temperature about 1.5 °C above
  surroundings.
- **Neighbourhood:** score 71; nearest metro none within 2.5 km; grocery 640 m; school 900 m;
  healthcare 1.1 km; commute to Manyata Tech Park 22 min (peak 38 min); AQI 92 (moderate, PM2.5);
  resident opinions with 5 sources (reddit.com, 99acres.com, magicbricks.com, housing.com,
  squareyards.com).

**Plot 2: "Established high ground", Basavanagudi (12.9425, 77.5737), overall LOW**
- **Ratings:** all low.
- **Water:** never water in 40 years.
- **Terrain:** 12.8 m above nearest drain.
- **Built-up:** 60% → 60%.
- **Greenery:** stable.
- **Findings:** "No red flags in the records we checked".
- **Neighbourhood:** score 90; metro (National College) 900 m; grocery 120 m; school 200 m;
  healthcare 150 m; AQI 78.

Show source chips with the real dataset names: JRC Global Surface Water (30 m, 1984–2021),
Dynamic World (10 m), MERIT Hydro / FABDEM (30 m), Sentinel-1, Sentinel-2, Landsat 8/9, Google
Places, Google Routes, Google Air Quality.

## 5. Screens every direction must have
1. **Home:** globe, the main search ("Search an address, layout, survey area or paste
   coordinates"), 3 example chips, a 3-step "How it works" row, and the brand.
2. **Analysing:** the fly-to plus scan sequence. Live steps (Water history → Land cover → Ground
   height → Rain → Change score → Gemini investigating → Verifying claims) and tabs filling in.
3. **Summary:**
   - the plot passport: header, passport chips, verdict, "What stands out" (1–3 signal cards with
     mini visuals), "Checked and clear" list, "What changed here"
   - the map toolbar with an open Layers popover (grouped, plain names)
4. **Land risk:** water story line, month grid, flood, terrain gauge, each with source chips and
   "Show on map".
5. **Land health:** greenery band chart, moisture, heat delta, built-up stream.
6. **Neighbourhood:** score, "My priorities" chips, nearest-essentials tiles, commute, air quality,
   amenity list, and "What residents say" with sources, labelled as opinions.
7. **Compare:** both plots side by side, best value per row marked. On phone width the columns
   become stacked cards.

All screens must work at **1440 px desktop** and **390 px phone** (bottom-sheet workspace on phone).

## 6. The four directions

### A. Mission Control: dark, precise, data-dense ("Palantir meets Linear")
- **Palette:**
  - graphite canvas `#0A0F12`, panel `#0F1619`, raised `#141D21`, border `#243238`
  - text `#E6EEF0` / `#A3B3B8` / `#6F8187`
  - accent signal teal `#3DD6C6`
- **Type:** Schibsted Grotesk display, Inter-like UI (use Atkinson Hyperlegible Next as in the app),
  IBM Plex Mono for every number.
- **Layout:** 56 px nav rail, top bar with breadcrumb and ⌘K, left workspace 480 px, right vertical
  map toolbar, thin hairline borders, compact spacing.
- **Motion:** crisp and fast (150–200 ms). A HUD reticle locks on to the plot; the scan line sweeps
  the circle; numbers tick up in monospace.

### B. Atlas: light, editorial, cartographic ("Apple Maps meets a field guide")
- **Palette:** warm paper `#F7F5F0`, white cards, ink `#1C1B19`, muted `#6B6760`, accent deep
  forest `#1F5C4A`, with gentle shadows.
- **Type:** a serif display (Fraunces or Newsreader from Google Fonts) for headlines and big
  numbers; Atkinson for UI.
- **Layout:** the map is the hero. The workspace is a floating rounded card (radius 20) with
  generous whitespace; the nav rail becomes a minimal top-left menu. Charts look like printed maps:
  thin lines, hand-labelled annotations.
- **Motion:** slow and calm (300–450 ms). Panels fade up, lines draw in like ink, and the map tilts
  gently on fly-to.

### C. Orbit: immersive, cinematic, glass ("Google Earth meets a Tesla UI")
- **Palette:**
  - deep space `#03060C`
  - glass panels `rgba(14,22,28,0.55)` with 20 px backdrop blur, 1 px `rgba(255,255,255,0.08)`
    borders
  - accent aurora gradient (teal `#2DD4BF` → blue `#60A5FA`)
  - risk colours glow softly
- **Type:** Schibsted Grotesk large and light-weight for the hero; mono for telemetry.
- **Layout:**
  - full-bleed globe at all times
  - workspace as stacked floating glass cards on the left that the map shows through
  - a bottom dock for tabs (macOS-dock style)
  - Layers as a radial or arc menu on the right
- **Motion: the showpiece.**
  - Home: an orbit ring and a slowly rotating globe with a soft atmosphere glow; the search bar
    "lands" from above.
  - Fly-to: a long cinematic arc from space down to the plot, then a ring pulse.
  - Analysing: concentric radar rings over the plot; each evidence step lights a satellite icon
    travelling along the orbit ring.
  - Results: cards cascade in with a slight 3D tilt.

### D. Dossier: report-first, trust and print ("Stripe docs meets a due-diligence file")
- **Palette:** white `#FFFFFF`, cool grey `#F3F5F7`, ink `#0B1220`, accent indigo `#3B5BDB`,
  risk colours as calm badges.
- **Type:** Atkinson for everything, with strong hierarchy; Plex Mono for citations.
- **Layout:**
  - **the report is the hero:** a centred document column (max 760 px) with a sticky table of
    contents (Summary, Land risk, Land health, Neighbourhood, Sources)
  - the map is a pinned panel on the right that syncs to the section you're reading (scroll-driven:
    scrolling to Water turns on the water layer)
  - every claim has a footnote number linking to a Sources section, like a legal or audit report
- **Motion:** minimal and functional. Scroll-linked map changes and smooth anchor scrolling; the
  footnote hover highlights the map area.

## 7. Motion rules (all directions)
- Use `motion` (`motion/react`) and CSS. Keep the shared timings and easings in `shared/motion.ts`.
- Every animation must respect `prefers-reduced-motion` (fall back to simple fades) and the lab's
  "Replay animation" button.
- **Animate meaning, not decoration:**
  - the fly-to shows *where*
  - the scan shows *work happening*
  - count-ups and line draws show *the data arriving*
  - layer reveals show *what's on the ground*
- **Performance:** 60 fps on a MacBook. No animating layout properties in long lists; prefer
  transform and opacity.

## 8. Quality bar ("a $10M-ARR SaaS")
- Pixel-consistent spacing (4 px grid), aligned baselines, `tabular-nums` on numbers.
- Real empty, loading and error states on at least the Neighbourhood screen (a toggle in the lab
  shell is fine).
- Accessible: visible focus rings, AA contrast in both themes, keyboard ⌘K and tab navigation.
- **No lorem ipsum. No emoji. No bar or pie charts.**

## 9. Build order and review
1. Shared foundation: lab shell, mock data, Globe, charts, motion. Then **direction A fully** (all 7
   screens). **Stop for owner review.**
2. Directions B, C and D, one at a time. After each: `npm run typecheck`, then a short note listing
   what's notable in that direction and what's unfinished.
3. Final: `DESIGN_LAB_NOTES.md` with a comparison table (look, strengths, risks, effort to port into
   `landlens-new`), plus screenshots of each direction's Summary screen in `screenshots/` (take
   these once at the end, not during development, to save tokens).

**Don't:**
- touch `landlens-new`
- call real APIs or add keys
- deploy
- commit, unless the owner asks

## 10. After the owner chooses
The chosen direction's tokens and components get ported into `landlens-new` following
`docs/UX_REDESIGN_PLAN.md` phases R0–R5, keeping all product logic unchanged. That's a separate
task.
