# AGENTS.md: rules for any coding agent working on SAMPAAA

Read `docs/CODEX_HANDOFF.md` before starting any task. It has the current state, the roadmap and
the specs. This file has the rules that always apply. If a task conflicts with a rule here, stop and
ask the human. Don't work around the rule.

## What SAMPAAA is
An AI land investigator. The user picks a plot (pin or drawn boundary). We read decades of public
satellite data about that exact ground and return a plain-language report in which **every claim
cites the data behind it**. Built for the Google Cloud AI Builder Cup 2026 (submission 18 Oct 2026,
finale 4 Dec 2026, Singapore).

## Non-negotiable product rules
1. **Never invent data.** No synthetic places, threads, reviews, numbers, shapes or "realistic
   fallbacks". When a source fails, show an honest empty or error state ("Couldn't load…", "Not
   enough data…") and record the gap in `Evidence.unavailable` or the equivalent.
2. **Demo mode is the only exception**, and it must be labelled. `EVIDENCE_PROVIDER=mock` shows the
   "Demo data" badge and illustrative shapes. Never mix mock values into a real report.
3. **The rules engine sets ratings; the LLM never does.** `backend/app/rules.py` computes every
   rating and confidence deterministically. Gemini explains and investigates. It may raise a rating
   by one level only with corroborating evidence, and the verifier enforces this.
4. **Every finding cites evidence paths.** For example `jrc.occurrence_core_pct` or
   `landcover.by_year.2016.water`. The verifier (`backend/app/agent/verifier.py`) drops findings with
   missing citations, numbers not present in the evidence, predictions, or comments on legal title.
   New evidence fields must be resolvable by the verifier's dotted-path lookup.
5. **Opinions are shown, never scored.** Resident sentiment, reviews and news are context with real
   source links. They never feed a numeric score.
6. **Say what we can't tell.** Each new data source gets its resolution, period and known blind
   spots surfaced in the UI (see the "limitations" pattern).

## Engineering rules
- **Secrets:** `backend/.env` and `frontend/.env.local` are git-ignored. Never print, log, commit or
  paste key values. Server keys stay on the server. The browser key (`VITE_GOOGLE_MAPS_KEY`) is
  restricted to Map Tiles plus allowed referrers.
- **Cost:**
  - Cache every Earth Engine result (`backend/.cache/ee/`, versioned by `CACHE_VERSION` in
    `app/tools/earthengine.py`; bump it when a query changes).
  - Cache Places results for at most 24 h (Google terms).
  - Do UI work with `EVIDENCE_PROVIDER=mock`.
  - Never loop paid API calls.
- **Tests must be hermetic.** `backend/tests/conftest.py` forces mock evidence and disables the agent.
  Fake Google and Overpass with monkeypatch. No network in tests. Run before every commit:
  - `cd backend && uv run pytest -q`
  - `cd frontend && npx tsc -b --noEmit`
- **Match the code around you.** Python 3.12, FastAPI, Pydantic v2, `uv`. React 19, Vite, TS,
  Tailwind v4 tokens in `frontend/src/index.css` (use the tokens, never raw colours, except the
  documented data palette), `motion`, `lucide-react`, MapLibre GL v6 globe. Keep comment density low
  and purposeful, like the existing files.
- **Charts:** no bar or pie charts in the report. Use the existing visual language (story line,
  month calendar, streamgraph, dial). Draw to scale.
- **Verification:** keep it cheap on tokens. Don't drive the browser or take screenshots to check
  your work unless the human asks for a visual check. Verify in this order:
  1. backend tests
  2. frontend typecheck
  3. `scripts/smoke.py` (API end to end, prints ✓/✗)
  4. `scripts/e2e` (headless Playwright, prints ✓/✗, saves screenshots only on failure)

  Then tell the human what to look at by eye on the preview link.
- **Git:** work on a feature branch, small commits, clear messages. Don't push or deploy unless the
  human asks.
- **Ports in dev:** API on 8090 (`frontend/.env.local` sets `LANDLENS_API=http://localhost:8090`),
  web on 5173.

## Where things live
- `backend/app/tools/earthengine.py`: real evidence and map-layer tiles
- `backend/app/tools/mock.py`: demo evidence
- `backend/app/rules.py`: ratings
- `backend/app/agent/`: Gemini investigator, verifier and writer
- `backend/app/locality/`: locality lens
- `backend/app/services/places.py`: Google Places and Geocoding
- `frontend/src/components/report/`: report sheet
- `frontend/src/components/MapCanvas.tsx`: globe, overlays, Google tiles
- `frontend/src/lib/layers.ts`: map layers
- `frontend/src/lib/googleTiles.ts`: Google Map Tiles protocol
