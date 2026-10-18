import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { AskPanel } from "./components/AskPanel";
import { BottomSheet } from "./components/BottomSheet";
import { MapReadout, publishView } from "./components/Hud";
import { CompareTray, CompareView } from "./components/Compare";
import { CommandSearch } from "./components/CommandSearch";
import { Inspector, type PlotShape } from "./components/HomePanels";
import { HomeOrbit } from "./components/home/HomeOrbit";
import { NavRail } from "./components/shell/NavRail";
import { TopBar } from "./components/shell/TopBar";
import { MapToolbar } from "./components/shell/MapToolbar";
import { CoachMarks } from "./components/shell/CoachMarks";
import { PlotWorkspace } from "./components/workspace/PlotWorkspace";
import { DEFAULT_POI_LIMITS, PlaceCard, PlacesControl, POI_CATEGORIES, pickPlaces, type PoiLimits } from "./components/locality/PlacesOnMap";
import type { WorkspaceTab } from "./components/workspace/WorkspaceTabs";
import { useTheme } from "./lib/theme";
import { clampWorkspaceWidth, defaultWorkspaceWidth, WORKSPACE_MIN_W } from "./lib/workspaceWidth";
import { MapCanvas, type Basemap, type Camera, type MapMarker, type Overlay } from "./components/MapCanvas";
import { ActiveLayerLegends, LayersPanel, TimelineScrubber } from "./components/MapTools";
import { ReportSheet } from "./components/report/ReportSheet";
import { LocalitySheet } from "./components/locality/LocalitySheet";
import { LocalityCompareTray, LocalityCompareView } from "./components/locality/LocalityCompare";
import { Wordmark, useIsDesktop } from "./components/ui";
import { api, newReportId } from "./lib/api";
import { contextualAskSuggestions } from "./lib/askSuggestions";
import { boundaryCenter, type BoundaryFeature } from "./lib/boundary";
import { circlePolygon, type LatLng } from "./lib/geo";
import { reverseGeocode, type Place } from "./lib/geocode";
import { availableLayers, buildOverlays, layerForDimension, type LayerId } from "./lib/layers";
import { useReport } from "./lib/useReport";
import {
  FINAL_STATUSES,
  type Alternative,
  type Dimension,
  type Example,
  type LocalityReport,
  type POICategory,
  type POIItem,
} from "./lib/types";
import { useCompare, type SavedPlot } from "./lib/saved";
import type { Report } from "./lib/types";
import { LEVEL_STYLE } from "./lib/evidence";

const globeCamera = (desktop: boolean, key = "globe"): Camera => ({
  key,
  center: { lat: 16, lng: 80 },
  zoom: desktop ? 1.6 : 1.1, // whole sphere visible above the mobile sheet
  pitch: 0,
  bearing: 0,
});
const RAIL_W = 56;
const WORKSPACE_STORAGE_KEY = "sampaaa.workspace-width";

function initialWorkspaceWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
    if (Number.isFinite(saved) && saved > 0) {
      return window.matchMedia("(min-width: 1024px)").matches ? clampWorkspaceWidth(saved, window.innerWidth) : saved;
    }
  } catch {
    // Storage can be unavailable in private browsing; resizing still works for this session.
  }
  return defaultWorkspaceWidth(window.innerWidth);
}

/** Short, readable label: "Bellandur Lake, Bengaluru East City Corporation" rather than the full address. */
function placeLabel(p: Place): string {
  const first = p.detail.split(", ").find((x) => x && x !== p.name);
  return first ? `${p.name}, ${first}` : p.name;
}

function urlReportId(): string | null {
  return new URLSearchParams(window.location.search).get("r");
}

export default function App() {
  const desktop = useIsDesktop();
  const [reportId, setReportId] = useState<string | null>(urlReportId);
  const { report, setReport, missing } = useReport(reportId);

  const [pin, setPin] = useState<LatLng | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [radius, setRadius] = useState(250);
  const [shape, setShape] = useState<PlotShape>("circle");
  const [boundary, setBoundary] = useState<BoundaryFeature | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [camera, setCamera] = useState<Camera>(() => globeCamera(window.matchMedia("(min-width: 1024px)").matches));
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ water: true, flood: true, built: false, lowlying: false, ndvi: false, lst: false });
  const [layerOrder, setLayerOrder] = useState<LayerId[]>(["water", "flood"]);
  const [workspaceWidth, setWorkspaceWidth] = useState(initialWorkspaceWidth);
  const workspaceWidthRef = useRef(workspaceWidth);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [alts, setAlts] = useState<Alternative[]>([]);
  const [comparing, setComparing] = useState(false);
  const [localityComparing, setLocalityComparing] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>("summary");
  const lens: "risk" | "locality" = tab === "neighbourhood" ? "locality" : "risk";
  const [theme, toggleTheme] = useTheme();
  const [notice, setNotice] = useState<string | null>(null);
  const localityKey = useRef<string | null>(null);
  const [locality, setLocality] = useState<LocalityReport | null>(null);
  const [localityLoading, setLocalityLoading] = useState(false);
  const [localityError, setLocalityError] = useState<string | null>(null);
  const [airHeatmap, setAirHeatmap] = useState(false);
  const [poiLimits, setPoiLimits] = useState<PoiLimits>(DEFAULT_POI_LIMITS);
  const [selectedPoi, setSelectedPoi] = useState<POIItem | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);
  const [compareIntent, setCompareIntent] = useState<{ fromId: string; label: string } | null>(null);
  const compareList = useCompare();

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!resizeStart.current) return;
      const next = clampWorkspaceWidth(resizeStart.current.width + event.clientX - resizeStart.current.x, window.innerWidth);
      workspaceWidthRef.current = next;
      setWorkspaceWidth(next);
    };
    const onUp = () => {
      if (!resizeStart.current) return;
      resizeStart.current = null;
      try {
        window.localStorage.setItem(WORKSPACE_STORAGE_KEY, String(workspaceWidthRef.current));
      } catch {
        // The resized panel remains usable even when persistence is blocked.
      }
    };
    const onWindowResize = () => {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const next = clampWorkspaceWidth(workspaceWidthRef.current, window.innerWidth);
      workspaceWidthRef.current = next;
      setWorkspaceWidth(next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  useEffect(() => setAskOpen(false), [reportId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!report || event.key.toLowerCase() !== "a" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      setAskOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report]);

  useEffect(() => {
    if (!askOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setAskOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askOpen]);

  // Neighbourhood data costs money: load it only when its tab is open, and not again for the same plot.
  useEffect(() => {
    const targetLat = pin?.lat ?? report?.location.lat;
    const targetLng = pin?.lng ?? report?.location.lng;
    const key = targetLat === undefined || targetLng === undefined ? null : `${targetLat},${targetLng}`;
    if (lens !== "locality") {
      if (localityKey.current !== key) {
        localityKey.current = null;
        setLocality(null);
      }
      return;
    }
    const targetLabel = label ?? report?.location.label ?? undefined;
    if (targetLat === undefined || targetLng === undefined || key === null) return;
    if (localityKey.current === key && locality) return;
    localityKey.current = key;
    setLocalityLoading(true);
    setLocalityError(null);
    setLocality(null);
    api
      .locality(targetLat, targetLng, targetLabel)
      .then((res) => {
        setLocality(res);
        setLocalityLoading(false);
      })
      .catch(() => {
        localityKey.current = null;
        setLocalityError("We couldn't check nearby places right now. Please try again in a moment.");
        setLocalityLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, pin?.lat, pin?.lng, report?.location.lat, report?.location.lng, label, report?.location.label]);

  useEffect(() => {
    setSelectedPoi(null);
  }, [lens, locality?.id]);

  useEffect(() => {
    setAirHeatmap(false);
  }, [lens, pin?.lat, pin?.lng, report?.location.lat, report?.location.lng]);

  const view: "home" | "inspect" | "report" = reportId ? "report" : pin ? "inspect" : "home";
  const done = !!report && FINAL_STATUSES.includes(report.status);
  const pickingSecond = !!compareIntent && view === "home";

  // Second plot of a "compare with another" finished: add it and open the comparison.
  useEffect(() => {
    if (!compareIntent || !report || !done || report.status === "error" || report.id === compareIntent.fromId) return;
    compareList.add({ reportId: report.id, label: report.location.label ?? "Plot", overall: report.verdict?.overall ?? null });
    setCompareIntent(null);
    setTimeout(() => setComparing(true), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareIntent, report?.id, done]);

  const compareWith = (r: Report) => {
    compareList.replace([{ reportId: r.id, label: r.location.label ?? "Plot", overall: r.verdict?.overall ?? null }]);
    setCompareIntent({ fromId: r.id, label: r.location.label ?? "this plot" });
    window.history.pushState({}, "", window.location.pathname);
    setReportId(null);
    setReport(null);
    const from = { lat: r.location.lat, lng: r.location.lng };
    setPin(null);
    setLabel(null);
    setCamera({ key: `pick-${Date.now()}`, center: from, zoom: 12.2, pitch: 20, bearing: 0 });
  };

  const flyTo = useCallback((p: LatLng, zoom = 16, pitch = 50, bearing = -12) => {
    setCamera({ key: `${p.lat},${p.lng},${zoom},${Date.now()}`, center: p, zoom, pitch, bearing });
  }, []);

  // Back/forward buttons
  useEffect(() => {
    const onPop = () => setReportId(urlReportId());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Opening a shared link: take the plot from the report and fly there.
  useEffect(() => {
    if (!report) return;
    const r = report.location;
    if (!pin || pin.lat !== r.lat || pin.lng !== r.lng) {
      setPin({ lat: r.lat, lng: r.lng });
      setLabel(r.label);
      setRadius(report.radius_m);
      if (r.geometry) {
        setShape("boundary");
        setBoundary({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: r.geometry.coordinates } });
      } else {
        setShape("circle");
        setBoundary(null);
      }
      flyTo({ lat: r.lat, lng: r.lng }, 15.6, 52);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  // Reset per-report map state.
  useEffect(() => {
    setYear(null);
    setPlaying(false);
    setAlts([]);
  }, [reportId]);

  const select = (p: LatLng, knownLabel?: string) => {
    setTab("summary");
    setPin(p);
    setLabel(knownLabel ?? null);
    setShape("circle");
    setBoundary(null);
    setBoundaryError(null);
    if (!knownLabel) reverseGeocode(p.lat, p.lng).then((l) => setLabel((cur) => cur ?? l ?? "Dropped pin"));
    flyTo(p);
  };

  const start = (p: LatLng, r: number, lbl: string | null, selectedBoundary: BoundaryFeature | null = null) => {
    const id = newReportId();
    api.createReport({
      lat: p.lat,
      lng: p.lng,
      radius_m: r,
      lang: "en",
      report_id: id,
      label: lbl ?? undefined,
      geometry: selectedBoundary?.geometry,
    }).catch(() => {});
    window.history.pushState({}, "", `?r=${id}`);
    setTab("summary");
    setReportId(id);
  };

  const startExample = (e: Example) => {
    const p = { lat: e.lat, lng: e.lng };
    const lbl = `${e.label}, ${e.city}`;
    setPin(p);
    setLabel(lbl);
    setRadius(e.radius_m);
    setShape("circle");
    setBoundary(null);
    flyTo(p, 15.6, 52);
    start(p, e.radius_m, lbl);
  };

  const backToMap = () => {
    window.history.pushState({}, "", window.location.pathname);
    setReportId(null);
    setReport(null);
  };

  const goHome = () => {
    backToMap();
    setPin(null);
    setLabel(null);
    setShape("circle");
    setBoundary(null);
    setBoundaryError(null);
    setTab("summary");
    setLocality(null);
    setLocalityError(null);
    setCamera(globeCamera(desktop, `globe-${Date.now()}`));
  };

  const openReport = (id: string) => {
    setComparing(false);
    window.history.pushState({}, "", `?r=${id}`);
    setTab("summary");
    setPin(null); // the report effect sets the pin and flies there
    setReportId(id);
  };

  const recheck = (p: SavedPlot) => {
    const loc = { lat: p.lat, lng: p.lng };
    setPin(loc);
    setLabel(p.label);
    setRadius(p.radius_m);
    setShape("circle");
    setBoundary(null);
    flyTo(loc, 15.6, 52);
    start(loc, p.radius_m, p.label);
  };

  const altMarkers: MapMarker[] = useMemo(
    () => alts.map((a, i) => ({ id: String(i), lat: a.lat, lng: a.lng, label: String(i + 1), color: LEVEL_STYLE[a.overall].color })),
    [alts],
  );

  const focusAlternative = (a: Alternative) => flyTo({ lat: a.lat, lng: a.lng }, 14.6, 40, 0);

  const investigateAlternative = (a: Alternative) => {
    const p = { lat: a.lat, lng: a.lng };
    const lbl = `${a.distance_km} km ${a.bearing} of ${report?.location.label ?? "the plot"}`;
    setPin(p);
    setLabel(lbl);
    setShape("circle");
    setBoundary(null);
    flyTo(p, 15.6, 52);
    start(p, report?.radius_m ?? radius, lbl);
  };

  const updateBoundary = (next: BoundaryFeature | null, focus = false) => {
    setBoundary(next);
    setBoundaryError(null);
    if (next) {
      const center = boundaryCenter(next);
      setPin(center);
      if (focus) flyTo(center, 16.4, 45, 0);
    }
  };

  const reportPanelProps = {
    report,
    missing,
    onBack: backToMap,
    onReportChange: setReport,
    onShowOnMap: (d: Dimension) => showOnMap(d),
    year,
    onAlternatives: (a: Alternative[]) => {
      setAlts(a);
      if (a.length && pin) flyTo(pin, 12.4, 30, 0); // zoom out to show the options
    },
    onFocusAlternative: focusAlternative,
    onInvestigateAlternative: investigateAlternative,
    onCompareWith: compareWith,
    onAsk: () => setAskOpen(true),
  };

  const enableLayer = (id: LayerId) => {
    setLayers((current) => ({ ...current, [id]: true }));
    setLayerOrder((current) => [...current.filter((item) => item !== id), id]);
  };

  const toggleLayer = (id: LayerId) => {
    const next = !layers[id];
    setLayers((current) => ({ ...current, [id]: next }));
    setLayerOrder((current) => (next ? [...current.filter((item) => item !== id), id] : current.filter((item) => item !== id)));
  };

  const showOnMap = (d: Dimension) => {
    const id = layerForDimension(d);
    if (id) enableLayer(id);
    if (pin) flyTo(pin, 16.2, 55, -25);
  };

  // Real evidence layers (Earth Engine tiles). Stays empty in demo mode, where shapes are illustrative.
  const [realTiles, setRealTiles] = useState<Record<string, string>>({});
  const reportDoneId = done && report && report.versions.evidence_provider !== "mock" ? report.id : null;
  const healthYear = year && Number(year) >= 2017 ? year : null;
  useEffect(() => {
    setRealTiles({});
    if (!reportDoneId) return;
    let live = true;
    api
      .layers(reportDoneId, healthYear)
      .then((r) => live && setRealTiles(r.layers))
      .catch((err) => console.warn("Failed to load evidence layers", err));
    return () => {
      live = false;
    };
  }, [reportDoneId, healthYear]);

  const overlays = useMemo(
    () => (done && report?.evidence && pin ? buildOverlays(report.evidence, pin, report.radius_m, layers, year, realTiles) : []),
    [done, report, pin, layers, year, realTiles],
  );

  const focusPOI = (poi: POIItem) => {
    setSelectedPoi(poi);
    flyTo({ lat: poi.lat, lng: poi.lng }, 16.5, 45, 0);
  };

  // Keep the map readable: only the nearest N of each category (set in the Places control) are drawn.
  const localityMarkers: MapMarker[] = useMemo(() => {
    if (lens !== "locality" || !locality) return [];
    const color = Object.fromEntries(POI_CATEGORIES.map((c) => [c.id, c.color])) as Record<POICategory, string>;
    return pickPlaces(locality.amenities.pois, poiLimits, selectedPoi?.id ?? null).map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      label: p.name,
      color: color[p.category] ?? "#3b82f6",
      type: "poi" as const,
      active: p.id === selectedPoi?.id,
    }));
  }, [lens, locality, poiLimits, selectedPoi]);

  const localityOverlays = useMemo<Overlay[]>(() => {
    if (lens !== "locality") return [];
    const center = pin ?? (report ? { lat: report.location.lat, lng: report.location.lng } : null);
    if (!center) return [];
    return [
      {
        id: "ring-500",
        color: "#10b981",
        feature: circlePolygon(center, 500),
        opacity: 0.12,
        visible: true,
      },
      {
        id: "ring-1000",
        color: "#3b82f6",
        feature: circlePolygon(center, 1000),
        opacity: 0.08,
        visible: true,
      },
      {
        id: "ring-2000",
        color: "#8b5cf6",
        feature: circlePolygon(center, 2000),
        opacity: 0.05,
        visible: true,
      },
      ...(airHeatmap
        ? [{
            id: "air-quality",
            color: "#7c3aed",
            tiles: `${window.location.origin}/api/locality/air/tiles/{z}/{x}/{y}`,
            opacity: 0.64,
            visible: true,
          }]
        : []),
    ];
  }, [lens, pin, report, airHeatmap]);

  const inWorkspace = view !== "home";
  const padding = desktop
    ? inWorkspace
      ? { left: RAIL_W + workspaceWidth }
      : {}
    : { bottom: inWorkspace ? Math.round(window.innerHeight * 0.5) : 0 };

  const locate = () => {
    if (!navigator.geolocation) {
      setNotice("Your browser can't share a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (view === "report") flyTo(p, 15, 40, 0);
        else select(p, "My location");
      },
      () => setNotice("Couldn't get your location. Check the browser's location permission."),
      { timeout: 8000 },
    );
  };

  const openCompare = () => {
    if (lens === "locality") {
      setLocalityComparing(true);
      return;
    }
    if (compareList.items.length >= 2) setComparing(true);
    else setNotice("Save two plots with Add to compare, then open Compare.");
  };

  const pickPlace = (p: Place) => select({ lat: p.lat, lng: p.lng }, placeLabel(p));

  const neighbourhood = (
    <LocalitySheet
      embedded
      locality={locality}
      loading={localityLoading}
      error={localityError}
      onBack={() => setTab("summary")}
      onFocusPOI={focusPOI}
      airHeatmapVisible={airHeatmap}
      onAirHeatmapChange={setAirHeatmap}
    />
  );

  const inspector = pin ? (
    <Inspector
      embedded
      label={label}
      lat={pin.lat}
      lng={pin.lng}
      radius={radius}
      onRadius={setRadius}
      shape={shape}
      boundary={boundary}
      boundaryError={boundaryError}
      onShape={(next) => {
        setShape(next);
        setBoundaryError(null);
      }}
      onBoundary={updateBoundary}
      onInvestigate={() => start(pin, radius, label, shape === "boundary" ? boundary : null)}
      onClose={goHome}
    />
  ) : null;

  const workspace =
    view === "report" ? (
      <ReportSheet {...reportPanelProps} tab={tab} onTab={setTab} neighbourhood={neighbourhood} locality={locality} />
    ) : view === "inspect" && pin ? (
      <PlotWorkspace label={label} lat={pin.lat} lng={pin.lng} tab={tab} onTab={setTab} onClose={goHome} summary={inspector} neighbourhood={neighbourhood} />
    ) : null;

  const layersPanel =
    view === "report" && done && report?.evidence && tab !== "neighbourhood" ? (
      <LayersPanel
        evidence={report.evidence}
        visible={layers}
        onToggle={toggleLayer}
        illustrative={report.versions.evidence_provider === "mock"}
      />
    ) : null;

  const timelineOn = view === "report" && done && !!report?.evidence && tab !== "neighbourhood" && Object.values(layers).some(Boolean);
  const crumbs = ["Explore", ...(view === "home" ? [] : [report?.location.label ?? label ?? "Selected plot"])];
  const mapAreaLeft = RAIL_W + workspaceWidth;
  const activeLegendIds = report?.evidence
    ? [...layerOrder].reverse().filter((id) => layers[id] && availableLayers(report.evidence!).includes(id)).slice(0, 3)
    : [];
  const askReady = !!report && done && report.status !== "error" && !!report.evidence && !!report.verdict;

  const resetWorkspaceWidth = () => {
    const next = clampWorkspaceWidth(defaultWorkspaceWidth(window.innerWidth), window.innerWidth);
    workspaceWidthRef.current = next;
    setWorkspaceWidth(next);
    try {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    } catch {
      // Reset still applies for this session when storage is blocked.
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink-950">
      <MapCanvas
        className="absolute inset-0"
        pin={pin}
        radiusM={report?.radius_m ?? radius}
        basemap={basemap}
        camera={camera}
        padding={padding}
        spin={view === "home" && !pickingSecond}
        scanning={view === "report" && !!report && !done}
        overlays={lens === "locality" ? localityOverlays : overlays}
        markers={lens === "locality" ? localityMarkers : view === "report" ? altMarkers : []}
        onView={publishView}
        mode={view === "report" && done && tab === "risk" ? "evidence" : "story"}
        onMarkerClick={(id) => {
          if (lens === "locality" && locality) {
            const p = locality.amenities.pois.find((x) => x.id === id);
            if (p) focusPOI(p);
          } else if (alts[Number(id)]) {
            focusAlternative(alts[Number(id)]);
          }
        }}
        onPick={view === "report" || shape === "boundary" ? undefined : (p) => select(p)}
        boundary={shape === "boundary" ? boundary : null}
        drawing={view === "inspect" && lens === "risk" && shape === "boundary"}
        onBoundaryChange={updateBoundary}
        onBoundaryError={setBoundaryError}
        onDrawingCancel={() => {
          setShape("circle");
          setBoundary(null);
          setBoundaryError(null);
        }}
      />

      {/* Vignette so the floating UI reads well over bright imagery */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(5,8,15,0.55)_100%)]" />

      {desktop && <MapReadout insetLeft={inWorkspace ? mapAreaLeft : RAIL_W} />}

      <NavRail
        compact={!desktop}
        exploring={!comparing}
        comparing={comparing}
        compareCount={compareList.items.length}
        theme={theme}
        onTheme={toggleTheme}
        onExplore={() => {
          setComparing(false);
          goHome();
        }}
        onCompare={openCompare}
        onOpenSaved={(p) => openReport(p.reportId)}
        onRecheckSaved={recheck}
        onPickPlace={pickPlace}
      />

      <TopBar
        compact={!desktop}
        crumbs={crumbs}
        near={pin ?? undefined}
        onSelect={pickPlace}
        hideSearch={view === "home" && !pickingSecond}
        home={view === "home"}
      />

      {view === "home" && !pickingSecond && (
        <div className={`on-map absolute top-4 z-30 ${desktop ? "left-[72px]" : "left-4"}`}>
          <Wordmark />
        </div>
      )}
      {view === "home" && !pickingSecond && <HomeOrbit onSearch={pickPlace} onExample={startExample} />}

      {/* Plot workspace: always on the left (a bottom sheet on phones) */}
      {desktop && (
        <AnimatePresence>
          {workspace && (
            <motion.aside
              key="workspace"
              aria-label="Plot workspace"
              initial={{ x: -workspaceWidth, opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -workspaceWidth, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="absolute bottom-0 top-[52px] z-20 border-r border-t border-line bg-ink-850 shadow-[20px_0_60px_rgba(0,0,0,0.35)]"
              style={{ left: RAIL_W, width: workspaceWidth }}
            >
              {workspace}
              <div
                role="separator"
                aria-label="Resize plot workspace"
                aria-orientation="vertical"
                aria-valuemin={WORKSPACE_MIN_W}
                aria-valuemax={Math.round(window.innerWidth * 0.6)}
                aria-valuenow={workspaceWidth}
                tabIndex={0}
                title="Drag to resize · double-click to reset"
                className="workspace-resizer"
                onPointerDown={(event) => {
                  event.preventDefault();
                  resizeStart.current = { x: event.clientX, width: workspaceWidthRef.current };
                }}
                onDoubleClick={resetWorkspaceWidth}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
                  event.preventDefault();
                  const next = event.key === "Home"
                    ? clampWorkspaceWidth(defaultWorkspaceWidth(window.innerWidth), window.innerWidth)
                    : clampWorkspaceWidth(workspaceWidthRef.current + (event.key === "ArrowRight" ? 24 : -24), window.innerWidth);
                  workspaceWidthRef.current = next;
                  setWorkspaceWidth(next);
                  try {
                    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, String(next));
                  } catch {
                    // Keyboard resizing remains available without persistence.
                  }
                }}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {inWorkspace && (
        <MapToolbar
          compact={!desktop}
          basemap={basemap}
          onBasemap={setBasemap}
          layers={layersPanel ?? undefined}
          onDraw={view === "inspect" && tab === "summary" ? () => setShape((s) => (s === "boundary" ? "circle" : "boundary")) : undefined}
          drawActive={shape === "boundary"}
          onLocate={locate}
        />
      )}

      <AnimatePresence>
        {desktop && timelineOn && report?.evidence && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.3 }}
            className="absolute bottom-5 right-16 z-20"
            style={{ left: mapAreaLeft + 20 }}
          >
            <TimelineScrubber evidence={report.evidence} year={year} onYear={setYear} playing={playing} onPlaying={setPlaying} />
          </motion.div>
        )}
      </AnimatePresence>

      {view === "report" && done && tab !== "neighbourhood" && activeLegendIds.length > 0 && (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: desktop ? mapAreaLeft + 16 : 12, bottom: desktop ? 18 : "calc(50vh + 14px)" }}
        >
          <ActiveLayerLegends ids={activeLegendIds} />
        </div>
      )}

      {inWorkspace && lens === "locality" && locality && (
        <div style={{ position: "absolute", left: desktop ? mapAreaLeft + 20 : 0, right: desktop ? "auto" : 0, top: 0, zIndex: 32 }}>
          <PlacesControl pois={locality.amenities.pois} limits={poiLimits} onChange={setPoiLimits} defaultOpen={desktop} />
        </div>
      )}
      <AnimatePresence>
        {inWorkspace && lens === "locality" && selectedPoi && (
          <div style={{ position: "absolute", left: desktop ? mapAreaLeft + 20 : 0, right: desktop ? "auto" : 0, bottom: 0, zIndex: 38 }}>
            <PlaceCard key={selectedPoi.id} poi={selectedPoi} onClose={() => setSelectedPoi(null)} />
          </div>
        )}
      </AnimatePresence>

      {desktop && inWorkspace && lens !== "locality" && <CoachMarks left={mapAreaLeft + 20} />}

      {/* "Compare with another": pick the second plot */}
      <AnimatePresence>
        {pickingSecond && compareIntent && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute left-1/2 top-16 z-30 w-[min(560px,calc(100vw-24px))] -translate-x-1/2"
          >
            <div className="panel rounded-2xl p-3">
              <p className="px-1 text-[13px] text-tx">
                <span className="text-ac">Step 2 of 2 ·</span> Pick a plot to compare with <span className="font-semibold">{compareIntent.label}</span>
              </p>
              <p className="px-1 pb-2 text-[12px] text-tx-2">Search below, or tap anywhere on the map.</p>
              <CommandSearch near={camera.center} onSelect={pickPlace} />
              <button onClick={() => setCompareIntent(null)} className="mt-2 px-1 text-[12px] text-tx-3 hover:text-tx">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compare tray (bottom centre of the map area) */}
      {inWorkspace && (
        <div
          className="absolute z-40 -translate-x-1/2"
          style={{
            left: desktop ? mapAreaLeft + (window.innerWidth - mapAreaLeft) / 2 : "50%",
            bottom: desktop ? (timelineOn ? 124 : 20) : 64,
          }}
        >
          {lens === "risk" ? <CompareTray onOpen={() => setComparing(true)} /> : <LocalityCompareTray onOpen={() => setLocalityComparing(true)} />}
        </div>
      )}
      <AnimatePresence>
        {lens === "risk" && comparing && <CompareView onClose={() => setComparing(false)} onOpenReport={openReport} />}
        {lens === "locality" && localityComparing && <LocalityCompareView onClose={() => setLocalityComparing(false)} />}
      </AnimatePresence>

      {/* Phones: the same workspace in a bottom sheet */}
      {!desktop && inWorkspace && workspace && <BottomSheet key={view} initial="half">{workspace}</BottomSheet>}

      {!desktop && report && !askOpen && (
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          aria-label="Ask Gemini"
          className="absolute bottom-[72px] right-4 z-50 flex h-12 items-center gap-2 rounded-full bg-ac px-4 font-semibold text-ac-ink shadow-xl"
        >
          <Sparkles className="h-4 w-4" /> Ask
        </button>
      )}

      <AnimatePresence>
        {askOpen && report && (
          <motion.aside
            role="dialog"
            aria-modal={!desktop}
            aria-label="Ask Gemini about this report"
            initial={{ x: "100%", opacity: 0.7 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.7 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className={`absolute right-0 z-[60] flex flex-col border-l border-line bg-ink-850 shadow-[-20px_0_60px_rgba(0,0,0,0.42)] ${desktop ? "bottom-0 top-[52px] w-[400px]" : "inset-y-0 left-0"}`}
          >
            <div className="flex h-[58px] shrink-0 items-center justify-between border-b border-line px-4">
              <p className="flex items-center gap-2 font-display text-[17px] font-semibold text-tx"><Sparkles className="h-4 w-4 text-ac" /> Ask Gemini</p>
              <button type="button" onClick={() => setAskOpen(false)} aria-label="Close Ask Gemini" className="grid h-8 w-8 place-items-center rounded-lg text-tx-3 hover:bg-chip hover:text-tx"><X className="h-4 w-4" /></button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
              {askReady ? (
                <AskPanel reportId={report.id} suggestions={contextualAskSuggestions(report)} />
              ) : (
                <div className="rounded-xl border border-dashed border-line-2 p-5 text-center" role="status">
                  <Sparkles className="mx-auto h-5 w-5 text-ac" />
                  <p className="mt-3 text-[14px] font-semibold text-tx">Ask questions once the analysis finishes</p>
                  <p className="mt-1 text-[12.5px] text-tx-2">Gemini will answer from the verified evidence in this report.</p>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-tx px-4 py-2 text-[13px] text-ink-850 shadow-lg"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
