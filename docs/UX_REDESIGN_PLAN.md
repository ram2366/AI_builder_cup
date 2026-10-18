# SAMPAAA: UX and UI redesign plan

Written 17 Oct 2026 (by Claude) for Codex or another Claude. Read `AGENTS.md` first; its rules
still apply. **Don't change product logic, data or scores. This is a presentation and navigation
redesign.**

**Goal:**
- A first-time user understands in 10 seconds what SAMPAAA does, where to search, and where each
  kind of answer lives.
- It looks and feels like a mature, premium SaaS product (think Linear, Vercel, Mapbox Studio,
  Felt, Planet Explorer), not a hackathon demo.

---

## 1. What's wrong today (diagnosis)

| # | Problem | Where you see it |
|---|---|---|
| 1 | **Two hidden "modes".** "Physical Risk" and "Locality & Life" sit in a small emoji toggle top-right; most users never find Locality. | `App.tsx` `lensToggle` |
| 2 | **Panels jump sides.** The Inspector opens on the right, the report on the left, the locality sheet on the left too, with different headers. | `HomePanels.tsx` Inspector, `ReportSheet.tsx`, `LocalitySheet.tsx` |
| 3 | **Controls are scattered across five corners:** search top-left, lens and basemap top-right, layers panel under them, timeline bottom-centre, compare tray bottom, zoom bottom-right, HUD telemetry top. | map chrome in `App.tsx`, `MapTools.tsx`, `Hud.tsx` |
| 4 | **Two competing calls to action** ("Investigate this land" and "Check Locality & Amenities") with long waits (~40 s / ~20 s) and no preview of what you'll get. | Inspector |
| 5 | **Inconsistent naming:** SAMPAAA / Sampaaa / LandLens / "Locality Lens" / "Physical Risk" / "Neighbourhood check". | headers, tabs |
| 6 | **Jargon up front:** NDVI, MNDWI, HAND, JRC show as primary labels. | Evidence, Land Health, layers |
| 7 | **Map clutter:** POI name pills overlap each other in dense areas. | `.ll-poi` markers |
| 8 | **Emoji in controls** (🌍 🏙️) and mixed visual weights look cheap. | lens toggle, Inspector button |
| 9 | **No sense of place in the app:** no navigation, no breadcrumb. Saved plots, compare and history live in different trays. | `SavedPlots`, `Compare`, `LocalityCompare` |
| 10 | **Light sheets on a dark globe** sometimes clash, and the two themes differ in polish. | `index.css` tokens |

## 2. The new mental model: one plot, one workspace

The user picks a **plot**, and everything about it lives in one **Plot workspace**, with tabs for
each kind of answer. "Lenses" stop being modes and become tabs.

```
┌────┬──────────────────────────────────────────────────────────────────────────┐
│ ◎  │  Explore › Bengaluru › Prestige Shantiniketan          [⌘K Search…]  Share  Save │  ← top bar
│ ─  ├───────────────────────────────┬──────────────────────────────────────────┤
│ 🗺 │ PLOT WORKSPACE (left, 480px)  │                                     ┌──┐ │
│ ★  │ Tower 4, Prestige Shant…  ✕  │            MAP / GLOBE              │▦ │ │  ← map toolbar
│ ⇄  │ 2.4 acres · drawn boundary    │                                     │◫ │ │   (right edge,
│ 🕘 │ ┌──────────────────────────┐ │                                     │✎ │ │    vertical)
│    │ │ Summary │ Land risk │     │ │                                     │⤢ │ │
│    │ │ Land health │ Neighbourhood│ │                                     │+−│ │
│ ?  │ │ Ask                       │ │                                     └──┘ │
│ ◐  │ └──────────────────────────┘ │   ╭─ timeline (only when a time layer on) ─╮ │
│    │  …tab content…               │   ╰────────────────────────────────────────╯ │
└────┴───────────────────────────────┴──────────────────────────────────────────┘
 nav rail (56px)
```

### Navigation rail (left, 56 px, icons with tooltips)
- **Explore:** the map.
- **Saved plots.**
- **Compare:** plots *and* localities in one place; merges the two compare trays.
- **History:** recent reports.
- Bottom: **Help / How it works**, theme toggle.

### Top bar
- Breadcrumb: `Explore › City › Plot name`.
- **Command bar** in the centre: ⌘K or click. It searches addresses, coordinates, examples and
  actions such as "Draw boundary", "Compare", "Toggle layers".
- Share, Save and Export on the right.

### Plot workspace (always on the left; the same component on every screen)
- **Header:**
  - plot name (truncated, full name in a tooltip)
  - plot size and type (circle 250 m / drawn boundary 2.4 acres / imported KML)
  - a close button
- **Plot passport strip:** one chip per area, each opening its tab:
  - `Land risk: High`
  - `Land health: Stable`
  - `Neighbourhood: 82/100`
  - `Data as of Oct 2026`
- **Tabs:**
  1. **Summary:** the "plot passport". Verdict, "What stands out", "Checked and clear", plus one
     line from each other tab with "Open →".
  2. **Land risk:** water, flood and terrain findings and their evidence (today's Overview and
     Evidence content).
  3. **Land health:** greenery, moisture, heat, built-up trend (today's `LandHealthPanel`).
  4. **Neighbourhood:**
     - score with "My priorities"
     - nearest essentials, amenities list, commute, air quality
     - what residents say, with sources
     - (today's `LocalitySheet`, `LocalityPriorities`)
  5. **Ask:** Q&A (`AskPanel`).
- **One main button:** **"Analyse this plot"**.
  - It runs the land report, and the tabs fill in as their data arrives, each with its own
    skeleton.
  - **Cost rule:** the Neighbourhood data (~₹20, Places plus grounding) loads only when that tab or
    its passport chip is opened, never automatically.

### Map toolbar (right edge, one vertical group)
- **Layers:** a popover with grouped toggles, plain names first and the technical name second:
  - Water: *Past water* (JRC), *Monsoon water*
  - Flood: *Flood events*, *Flood hazard*
  - Ground: *Low-lying land*, *Height*
  - Growth: *New buildings*, *Built-up*
  - Health: *Greenery (NDVI)*, *Heat (land temperature)*
  - Neighbourhood: *Places*, *Air quality*

  Disabled layers say why in the tooltip.
- **Basemap:** Satellite / Map.
- **Draw:** circle, boundary or import KML.
- **2D/3D**, **locate me**, zoom.
- The **timeline** docks along the bottom of the map *only* when a time-based layer is on.
- The **HUD telemetry** (coordinates, altitude) shrinks to one muted line in the bottom-left of the
  map, or hides behind the Help menu.

### Map annotations
- POIs become **small category-icon dots, clustered** when they overlap.
- Names appear on hover, or when the item is selected in the list.
- At most one label is visible at a time when zoomed out.

## 3. Key flows (must be obvious with no instructions)

1. **First visit (home):**
   - The globe, plus one large centred command bar: "Search an address, layout, survey area or
     paste coordinates".
   - Under it: 3 example chips and a 3-step "How it works" row (Pick a plot → We read 40 years of
     satellite data → You get a cited report).
   - No other chrome until a plot is chosen.
2. **Pick a plot:**
   - The map flies to it and the workspace slides in with the header and the plot-size control
     (Circle radius / Draw / Import).
   - The workspace shows **"Analyse this plot"** plus a one-line preview: "Water history · Floods ·
     Ground height · Greenery · Neighbourhood".
3. **Analyse:**
   - Staged progress in the Summary tab, using the existing `ProgressTimeline` copy.
   - Tabs show spinners and turn solid when ready.
   - The estimated time is shown ("about 40 s").
4. **Explore results:**
   - Every finding has **Show on map**, which turns on the right layer and zooms.
   - Every number has a **source chip** (dataset, resolution, period).
5. **Compare:** save plots or localities with ★, then open **Compare** in the rail to see up to 3
   side by side.
6. **Share / Export:** a share link plus a print/PDF pack (existing `PrintPack`).

**First-run coach marks** (3, dismissible, stored in localStorage):
- the command bar
- the workspace tabs
- the map Layers button

## 4. Visual design system ("premium SaaS")

### Theme
- **Dark is the default** ("mission control" over the globe).
- Light mode is fully supported and equally polished.
- Panels over the map use the **same family**: dark graphite panels in dark mode, white panels in
  light mode. No light sheets on a dark map in dark mode.

### Colour tokens
Keep the `@theme` structure in `frontend/src/index.css` and refine the values.
- **Neutrals:** a cool graphite scale with a slight teal bias, 10 steps.
  - Dark: `#0A0F12` (canvas), `#0F1619` (panel), `#141D21` (raised), `#1B262B` (hover),
    `#243238` (border), text `#E6EEF0` / `#A3B3B8` / `#6F8187`.
  - Light: `#F6F8F8` canvas, `#FFFFFF` panel, borders `#E2E8EA`, text `#0E1A1D` / `#4B5B60` /
    `#7C8B90`.
- **Brand accent:** one colour, a "signal teal". Dark `#3DD6C6`, light `#0E7C74`, with a soft
  variant for chips and selections.
  - Use it only for primary actions, focus and selection.
- **Semantic risk palette:** keep the existing high / elevated / moderate / low hues (already tuned
  for both themes). Never reuse them for decoration.
- **Data palette:** keep the existing water, flood, built and signal colours. Add greenery
  `#4CAF7A` / `#7FD3A1`, heat `#E2713B` / `#F29A68`, air `#8C7AE6` / `#B3A6F0`.
  - Every map layer and chart uses these, so the same colour means the same thing everywhere.

### Typography
Keep the current families. They're distinctive and cover Hindi and Kannada.
- **Display:** Schibsted Grotesk. **UI and body:** Atkinson Hyperlegible Next. **Numbers and
  codes:** IBM Plex Mono, with `tabular-nums` on all numbers.
- **Scale (px):** 12 / 13 / 14 (body) / 16 / 20 / 24 / 32 / 44 (home hero only).
  - Weights: 400, 500, 600, 700.
  - Uppercase labels: 11 px, +0.08 em tracking.

### Shape and depth
- 4 px spacing grid.
- Radii: 6 (inputs, chips), 10 (cards), 14 (panels), full (pills).
- **Borders over shadows.** 1 px hairline borders, plus three elevation levels: flat, raised
  (subtle shadow), overlay (panel over map: shadow plus 12 px backdrop blur, map overlays only).
- Cards only where something is a separate object. No card-in-card-in-card.

### Iconography and motion
- **lucide-react only; no emoji** anywhere in the UI.
- 150–220 ms, ease-out. Panels slide, tabs crossfade.
- Respect `prefers-reduced-motion`.
- Keep the globe spin, needle spring and chart draw-in. Remove other bounces.

### Component kit
Build in `frontend/src/components/ui/`:
- **Shell:** `AppShell`, `NavRail`, `TopBar` with `Breadcrumb`, `CommandPalette` (⌘K)
- **Workspace:** `PlotWorkspace`, `PassportChip`, `Tabs`
- **Content:** `Card`, `StatTile`, `SourceChip`, `Callout`
- **Controls:** `SegmentedControl`, `MapToolbar`, `LayerPopover`
- **Overlays:** `Popover`, `Tooltip`, `Toast`
- **States:** `Skeleton`, `EmptyState`, `ErrorState`
- **Keyboard:** `KbdHint`

Migrate existing screens onto these. Don't restyle each screen by hand.

### Copy and naming
- **Product name:** SAMPAAA, always uppercase in the logo and title case nowhere else.
- **Tab names:** Summary, Land risk, Land health, Neighbourhood, Ask.
- **Plain language first, technical second:** "Greenery (NDVI)", "Height above nearest drain
  (HAND)", "Past water (JRC 1984–2021)".
- **Every number shows its unit and source.**
- **Errors and empty states** say what happened and what to do, never just "error".

## 5. Mobile (≤ 768 px)
- The map is full screen, with a **bottom sheet** holding the same workspace and tabs as a
  horizontal scroll strip.
- The command bar is pinned at the top.
- The map toolbar collapses to 3 buttons (Layers, Draw, Locate).
- The nav rail becomes a bottom tab bar on the home screen only.
- Touch targets ≥ 44 px. No hover-only information.

## 6. Accessibility
- WCAG AA contrast in both themes, including chart text and chips over the map.
- Full keyboard path: ⌘K, then arrows and Enter, tab through the workspace, Esc closes overlays.
  Visible focus rings in the accent colour.
- All map toggles and markers have accessible names. Charts have text summaries (`aria-label` or
  visually hidden).

## 7. Phased plan (each phase deploys to the **preview** tag only; the human reviews before the next phase)

| Phase | Scope | Done when |
|---|---|---|
| **R0: Design system** | Refine the tokens (section 4), build the `ui/` kit, add a hidden `/styleguide` route that shows every component in both themes. | Styleguide looks consistent in light and dark; typecheck passes. |
| **R1: App shell** | `AppShell`, `NavRail`, `TopBar`, `CommandPalette` (⌘K wraps the existing `CommandSearch` plus examples plus actions), map toolbar, layer popover. Remove the scattered chrome and the emoji toggle. | Fewer than 3 control clusters on the map; e2e "home loads" and "search → pick" pass. |
| **R2: Plot workspace** | One `PlotWorkspace` on the left with passport chips and tabs. Move report, land health and locality content into tabs without changing their logic. Single "Analyse this plot". Neighbourhood loads lazily. | A new user finds Neighbourhood with no instructions (tab visible); e2e flows updated and passing. |
| **R3: Map polish** | POI clustering, hover labels, timeline docking, HUD minimised, "Show on map" from every finding. | No overlapping labels at city zoom. |
| **R4: Onboarding and states** | Home hero, how-it-works row, coach marks, skeletons, empty and error states, toasts, copy pass (section 4 naming). | Every async area has loading, empty and error states. |
| **R5: Mobile and accessibility** | Bottom sheet, tab strip, toolbar collapse, keyboard path, contrast fixes. | e2e passes at 375 px; keyboard-only flow works. |
| **R6 (optional): Landing page** | Marketing page at `/` (problem, how it works, the 3 lenses, trust/data sources, CTA "Open the app"); app moves to `/app`. Keep deep links working. | Judges understand the product before opening the map. |

**Rules for every phase:**
- Don't change data, rules, scores or API contracts.
- Keep the existing chart components and colours of meaning.
- Verify with tests → typecheck → `scripts/smoke.py` → `scripts/e2e` (update flows as the UI
  changes). Take screenshots only when a flow fails.
- Give the human a short by-eye checklist for the preview link.
- Don't move traffic from the `submission` revision. No commits or discarding changes unless asked.

## 8. How we'll judge it
- **Time to first insight:** a new user goes from landing to a verdict in under 60 s without help.
- **Findability:** asked "where are the nearby schools?" or "how green is it here?", a new user
  finds them in one click.
- **Calm map:** at most 3 control clusters over the map at any time.
- **Consistency:** one panel position, one header pattern, one source-chip style, one naming
  scheme everywhere.
- **Polish:** both themes pass AA contrast. No emoji. No layout jumps when data loads.
