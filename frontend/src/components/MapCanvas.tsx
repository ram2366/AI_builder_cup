import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapMouseEvent, StyleSpecification } from "maplibre-gl";
import {
  TerraDraw,
  TerraDrawModeUndoRedo,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import "maplibre-gl/dist/maplibre-gl.css";
import { boundaryDraftMetrics, validateBoundary, type BoundaryFeature, type BoundaryMetrics } from "../lib/boundary";
import { circlePolygon, graticule, rangeTicks, type Feature, type LatLng } from "../lib/geo";
import { hasGoogleTiles, registerGoogleProtocols, viewportCopyright } from "../lib/googleTiles";

registerGoogleProtocols();

export type Basemap = "satellite" | "streets";

export interface Camera {
  /** Change `key` to trigger a camera move. */
  key: string;
  center: LatLng;
  zoom: number;
  pitch?: number;
  bearing?: number;
  /** Fly (cinematic arc) or ease (short move). */
  mode?: "fly" | "ease";
  duration?: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  type?: "alt" | "poi";
  active?: boolean;
}

export interface Overlay {
  id: string;
  color: string;
  /** Illustrative shape (demo mode). */
  feature?: Feature;
  /** Real evidence as XYZ raster tiles (Earth Engine). Takes precedence over `feature`. */
  tiles?: string;
  opacity: number;
  visible: boolean;
}

interface Props {
  pin: LatLng | null;
  radiusM: number;
  basemap: Basemap;
  camera: Camera;
  /** Pixels hidden behind side panels, so the camera centres on the visible map area. */
  padding?: { left?: number; right?: number; top?: number; bottom?: number };
  spin?: boolean;
  scanning?: boolean;
  overlays?: Overlay[];
  markers?: MapMarker[];
  onMarkerClick?: (id: string) => void;
  onPick?: (p: LatLng) => void;
  boundary?: BoundaryFeature | null;
  drawing?: boolean;
  onBoundaryChange?: (feature: BoundaryFeature | null) => void;
  onBoundaryError?: (message: string | null) => void;
  onDrawingCancel?: () => void;
  /** "evidence" switches to a precise look: greyscale imagery, signal-orange target. */
  mode?: "story" | "evidence";
  /** Live camera + cursor telemetry for the HUD. */
  onView?: (v: ViewState) => void;
  className?: string;
}

export interface ViewState {
  lat: number;
  lng: number;
  zoom: number;
  bearing: number;
  pitch: number;
  altitudeM: number;
  cursor: LatLng | null;
}

// Google Map Tiles when VITE_GOOGLE_MAPS_KEY is set; Esri / OpenFreeMap otherwise.
// Satellite carries Google's road and place labels baked in (layerRoadmap), so no separate label layer.
const GRADE = { "raster-saturation": -0.45, "raster-contrast": 0.16, "raster-brightness-max": 0.86, "raster-hue-rotate": 8 } as const;

function rasterStyle(tiles: string, maxzoom: number, attribution: string, extra?: StyleSpecification["sources"], grade = true): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" }, // render as a globe from the very first frame
    sources: { imagery: { type: "raster", tiles: [tiles], tileSize: 256, maxzoom, attribution }, ...extra },
    layers: [
      { id: "space", type: "background", paint: { "background-color": "#03060c" } },
      // "Intelligence" grade: cooler, desaturated, higher contrast so overlays and HUD pop.
      { id: "imagery", type: "raster", source: "imagery", paint: grade ? GRADE : {} },
      ...(extra ? [{ id: "labels", type: "raster" as const, source: "labels", paint: { "raster-opacity": 0.7 } }] : []),
    ],
  };
}

const SATELLITE: StyleSpecification = hasGoogleTiles
  ? rasterStyle("gsat://{z}/{x}/{y}", 21, "")
  : rasterStyle(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      19,
      "Imagery © Esri, Maxar, Earthstar Geographics",
      {
        labels: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
        },
      },
    );
const STREETS: StyleSpecification | string = hasGoogleTiles
  ? rasterStyle("groad://{z}/{x}/{y}", 21, "", undefined, false)
  : "https://tiles.openfreemap.org/styles/dark";

const SKY = {
  "sky-color": "#020617",
  "horizon-color": "#0e7490",
  "fog-color": "#06202a",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.8,
  "fog-ground-blend": 0.9,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0],
} as const;

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "ll-pin";
  el.innerHTML = `<span class="ll-reticle"></span><span class="ll-pin-pulse"></span><svg viewBox="0 0 32 42" width="32" height="42"><path d="M16 41s14-13.5 14-25A14 14 0 0 0 2 16c0 11.5 14 25 14 25z" fill="#2dd4bf" stroke="#04221e" stroke-width="2.2"/><circle cx="16" cy="16" r="5.5" fill="#04221e"/></svg>`;
  return el;
}

function metersPerPixel(lat: number, zoom: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export function MapCanvas(props: Props) {
  const { pin, radiusM, basemap, camera, padding, scanning, overlays, onPick, className } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinMarker = useRef<maplibregl.Marker | null>(null);
  const scanMarker = useRef<maplibregl.Marker | null>(null);
  const extraMarkers = useRef<maplibregl.Marker[]>([]);
  const drawRef = useRef<TerraDraw | null>(null);
  const drawSignature = useRef("");
  const appliedCameraKey = useRef<string | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const shownBasemap = useRef(basemap);
  const [copyright, setCopyright] = useState("");
  const [styleRevision, setStyleRevision] = useState(0);
  const [draftMetrics, setDraftMetrics] = useState<BoundaryMetrics | null>(null);
  const [draftVertices, setDraftVertices] = useState(0);
  const [canUndo, setCanUndo] = useState(false);

  /** (Re)apply everything that lives inside the style: projection, sky, overlays, analysis circle. */
  const syncStyle = () => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      // Not "idle": the spinning globe is never idle. Retry shortly instead.
      setTimeout(syncStyle, 120);
      return;
    }
    const { pin: p, radiusM: r, overlays: ovs = [], boundary } = latest.current;
    map.setProjection({ type: "globe" });
    map.setSky(SKY as never);

    // Hide overlays from a previous report that aren't part of the current set.
    const current = new Set(ovs.map((o) => (o.tiles ? `ovr-${o.id}` : `ov-${o.id}`)));
    for (const l of map.getStyle().layers) {
      const src = (l as { source?: string }).source;
      if (src?.startsWith("ov") && !current.has(src)) {
        const prop = l.type === "fill" ? "fill-opacity" : l.type === "raster" ? "raster-opacity" : "line-opacity";
        map.setPaintProperty(l.id, prop, 0);
      }
    }

    for (const o of ovs) {
      if (o.tiles) {
        const src = `ovr-${o.id}`;
        const existing = map.getSource(src) as maplibregl.RasterTileSource | undefined;
        if (!existing) {
          map.addSource(src, { type: "raster", tiles: [o.tiles], tileSize: 256 });
          map.addLayer({ id: `${src}-raster`, type: "raster", source: src, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 400 } } });
        } else if (existing.tiles?.[0] !== o.tiles) {
          existing.setTiles([o.tiles]);
        }
        map.setPaintProperty(`${src}-raster`, "raster-opacity", o.visible ? Math.min(1, o.opacity * 0.85) : 0);
        continue;
      }
      if (!o.feature) continue;
      const src = `ov-${o.id}`;
      if (!map.getSource(src)) {
        map.addSource(src, { type: "geojson", data: o.feature as never });
        map.addLayer({ id: `${src}-fill`, type: "fill", source: src, paint: { "fill-color": o.color, "fill-opacity": 0, "fill-opacity-transition": { duration: 400 } } });
        map.addLayer({ id: `${src}-line`, type: "line", source: src, paint: { "line-color": o.color, "line-width": 1.2, "line-opacity": 0 } });
      } else {
        (map.getSource(src) as GeoJSONSource).setData(o.feature as never);
      }
      const op = o.visible ? o.opacity : 0;
      map.setPaintProperty(`${src}-fill`, "fill-opacity", op * 0.5);
      map.setPaintProperty(`${src}-line`, "line-opacity", op * 0.9);
    }

    if (!map.getSource("graticule")) {
      map.addSource("graticule", { type: "geojson", data: graticule() as never });
      map.addLayer({
        id: "graticule",
        type: "line",
        source: "graticule",
        paint: {
          "line-color": "#99f6e4",
          "line-width": ["case", ["get", "major"], 1.6, 1],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.75, 3, 0.6, 5, 0.15, 6.5, 0],
          "line-dasharray": [3, 2],
        },
      });
    }
    if (!map.getSource("aoi-ticks")) {
      map.addSource("aoi-ticks", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "aoi-ticks",
        type: "line",
        source: "aoi-ticks",
        paint: { "line-color": "#5eead4", "line-width": ["case", ["get", "major"], 2, 1], "line-opacity": 0.75 },
      });
    }
    (map.getSource("aoi-ticks") as GeoJSONSource).setData(
      (p && !boundary ? rangeTicks(p, r) : { type: "FeatureCollection", features: [] }) as never,
    );

    if (!map.getSource("aoi")) {
      map.addSource("aoi", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "aoi-fill", type: "fill", source: "aoi", paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.07 } });
      map.addLayer({ id: "aoi-glow", type: "line", source: "aoi", paint: { "line-color": "#2dd4bf", "line-width": 10, "line-opacity": 0.22, "line-blur": 6 } });
      map.addLayer({ id: "aoi-line", type: "line", source: "aoi", paint: { "line-color": "#5eead4", "line-width": 2 } });
    } else {
      for (const id of ["aoi-fill", "aoi-glow", "aoi-line", "aoi-ticks"]) map.moveLayer(id);
    }
    const ev = latest.current.mode === "evidence";
    if (map.getLayer("imagery")) {
      map.setPaintProperty("imagery", "raster-saturation", ev ? -1 : -0.45);
      map.setPaintProperty("imagery", "raster-contrast", ev ? 0.1 : 0.16);
    }
    map.setPaintProperty("aoi-line", "line-color", ev ? "#d9531e" : "#5eead4");
    map.setPaintProperty("aoi-line", "line-width", ev ? 2.5 : 2);
    map.setPaintProperty("aoi-glow", "line-opacity", ev ? 0 : 0.22);
    map.setPaintProperty("aoi-fill", "fill-opacity", ev ? 0.03 : 0.07);
    if (map.getLayer("aoi-ticks")) map.setPaintProperty("aoi-ticks", "line-color", ev ? "#d9531e" : "#5eead4");
    (map.getSource("aoi") as GeoJSONSource).setData(
      (boundary ?? (p && !latest.current.drawing ? circlePolygon(p, r) : { type: "FeatureCollection", features: [] })) as never,
    );
  };

  const sizeScan = () => {
    const map = mapRef.current;
    const m = scanMarker.current;
    const p = latest.current.pin;
    if (!map || !m || !p) return;
    const px = (2 * latest.current.radiusM) / metersPerPixel(p.lat, map.getZoom());
    const el = m.getElement();
    el.style.width = el.style.height = `${Math.round(px)}px`;
  };

  const refreshDraft = (draw: TerraDraw) => {
    const polygon = draw.getSnapshot().find((feature) => feature.geometry.type === "Polygon");
    if (!polygon) {
      setDraftMetrics(null);
      setDraftVertices(0);
    } else {
      const draft = boundaryDraftMetrics({
        type: "Feature",
        properties: {},
        geometry: polygon.geometry as BoundaryFeature["geometry"],
      });
      setDraftMetrics(draft.metrics);
      setDraftVertices(draft.vertices);
    }
    try {
      setCanUndo(draw.canUndo());
    } catch {
      setCanUndo(false);
    }
  };

  const undoDrawingPoint = () => {
    const draw = drawRef.current;
    if (!draw) return;
    try {
      if (draw.canUndo()) draw.undo();
      refreshDraft(draw);
    } catch {
      setCanUndo(false);
    }
  };

  const cancelDrawing = () => {
    const draw = drawRef.current;
    try {
      draw?.clear();
    } catch {
      // The parent still leaves drawing mode if a style reload removed the draw sources first.
    }
    setDraftMetrics(null);
    setDraftVertices(0);
    setCanUndo(false);
    latest.current.onBoundaryError?.(null);
    latest.current.onBoundaryChange?.(null);
    latest.current.onDrawingCancel?.();
  };

  // create the map once
  useEffect(() => {
    if (!box.current) return;
    const c = latest.current.camera;
    const map = new maplibregl.Map({
      container: box.current,
      style: basemap === "satellite" ? SATELLITE : STREETS,
      center: [c.center.lng, c.center.lat],
      zoom: c.zoom,
      pitch: c.pitch ?? 0,
      bearing: c.bearing ?? 0,
      maxPitch: 70,
      attributionControl: hasGoogleTiles ? false : { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.on("click", (e: MapMouseEvent) => {
      if (!latest.current.drawing) latest.current.onPick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on("style.load", () => {
      syncStyle();
      setStyleRevision((value) => value + 1);
    });
    map.on("zoom", sizeScan);
    map.on("error", (e) => console.warn("[map]", e.error?.message ?? e));

    // Telemetry for the HUD, throttled to one update per frame.
    let cursor: LatLng | null = null;
    let raf = 0;
    const emit = () => {
      raf = 0;
      const c = map.getCenter();
      const z = map.getZoom();
      latest.current.onView?.({
        lat: c.lat,
        lng: c.lng,
        zoom: z,
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        altitudeM: metersPerPixel(c.lat, z) * map.getCanvas().clientHeight,
        cursor,
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(emit);
    };
    map.on("move", schedule);
    map.on("mousemove", (e: MapMouseEvent) => {
      cursor = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      schedule();
    });
    map.on("mouseout", () => {
      cursor = null;
      schedule();
    });
    map.once("load", schedule);
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map;
    mapRef.current = map;

    // Slow globe rotation on the home screen until the user interacts.
    let userBusy = false;
    const spinStep = () => {
      if (!latest.current.spin || userBusy || map.getZoom() > 4) return;
      const ctr = map.getCenter();
      map.easeTo({ center: [ctr.lng - 5, ctr.lat], duration: 1000, easing: (n) => n });
    };
    map.on("mousedown", () => (userBusy = true));
    map.on("touchstart", () => (userBusy = true));
    map.on("mouseup", () => {
      userBusy = false;
      spinStep();
    });
    map.on("moveend", spinStep);
    map.once("load", spinStep);

    return () => {
      try {
        drawRef.current?.stop();
      } catch {
        // A basemap style swap may already have removed Terra Draw's MapLibre sources.
      }
      map.remove();
      mapRef.current = null;
      pinMarker.current = null; // markers belonged to the removed map
      scanMarker.current = null;
      extraMarkers.current = [];
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap switch
  useEffect(() => {
    if (shownBasemap.current === basemap) return;
    shownBasemap.current = basemap;
    try {
      drawRef.current?.stop();
    } catch {
      // The old style may already be gone.
    }
    drawRef.current = null;
    drawSignature.current = "";
    mapRef.current?.setStyle(basemap === "satellite" ? SATELLITE : STREETS);
  }, [basemap]);

  // Google requires its logo plus the live copyright line for whatever is on screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasGoogleTiles) return;
    let timer = 0;
    const kind = basemap === "satellite" ? "satellite" : "roadmap";
    const refresh = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        viewportCopyright(kind, map.getBounds(), map.getZoom())
          .then(setCopyright)
          .catch(() => setCopyright("Map data ©Google"));
      }, 500);
    };
    refresh();
    map.on("moveend", refresh);
    return () => {
      clearTimeout(timer);
      map.off("moveend", refresh);
    };
  }, [basemap]);

  // circle + overlays
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(syncStyle, [pin?.lat, pin?.lng, radiusM, overlays, props.mode, props.boundary, props.drawing]);

  // Terra Draw owns interactive polygon editing while the Inspector is in Draw mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!props.drawing) {
      try {
        drawRef.current?.stop();
      } catch {
        // Safe to ignore when a style swap already removed the adapter's sources.
      }
      drawRef.current = null;
      drawSignature.current = "";
      setDraftMetrics(null);
      setDraftVertices(0);
      setCanUndo(false);
      return;
    }

    const setup = () => {
      if (drawRef.current || !map.isStyleLoaded()) return;
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map, prefixId: "boundary" }),
        undoRedo: { modeLevel: new TerraDrawModeUndoRedo({ maxStackSize: 100 }) },
        modes: [
          new TerraDrawPolygonMode({
            styles: { fillColor: "#2dd4bf", fillOpacity: 0.16, outlineColor: "#5eead4", outlineWidth: 3 },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  selfIntersectable: false,
                  coordinates: { draggable: true, midpoints: true, deletable: true },
                },
              },
            },
            styles: { selectedPolygonColor: "#2dd4bf", selectedPolygonOutlineColor: "#f8fafc" },
          }),
        ],
      });

      const emitBoundary = () => {
        const polygon = draw.getSnapshot().find((feature) => feature.geometry.type === "Polygon");
        if (!polygon) {
          drawSignature.current = "";
          latest.current.onBoundaryChange?.(null);
          refreshDraft(draw);
          return;
        }
        try {
          const feature = validateBoundary({
            type: "Feature",
            properties: {},
            geometry: polygon.geometry as BoundaryFeature["geometry"],
          });
          drawSignature.current = JSON.stringify(feature.geometry.coordinates);
          latest.current.onBoundaryError?.(null);
          latest.current.onBoundaryChange?.(feature);
        } catch (error) {
          latest.current.onBoundaryError?.(error instanceof Error ? error.message : "This boundary is invalid.");
        }
        refreshDraft(draw);
      };
      draw.on("finish", () => {
        emitBoundary();
        draw.setMode("select");
      });
      draw.on("change", () => {
        refreshDraft(draw);
        if (draw.getMode() === "select") emitBoundary();
      });
      draw.on("history", () => refreshDraft(draw));
      draw.start();
      drawRef.current = draw;

      const boundary = latest.current.boundary;
      if (boundary) {
        draw.addFeatures([{ type: "Feature", properties: { mode: "polygon" }, geometry: boundary.geometry }]);
        drawSignature.current = JSON.stringify(boundary.geometry.coordinates);
        draw.setMode("select");
        const polygonId = draw.getSnapshot().find((feature) => feature.geometry.type === "Polygon")?.id;
        if (polygonId !== undefined) draw.selectFeature(polygonId);
      } else {
        draw.setMode("polygon");
      }
      refreshDraft(draw);
    };

    let setupTimer = 0;
    const waitForStyle = () => {
      if (map.isStyleLoaded()) setup();
      else setupTimer = window.setTimeout(waitForStyle, 120);
    };
    waitForStyle();
    return () => {
      window.clearTimeout(setupTimer);
    };
  }, [props.drawing, styleRevision]);

  useEffect(() => {
    if (!props.drawing) return;
    const map = mapRef.current;
    const target = latest.current.camera;
    map?.easeTo({
      center: [target.center.lng, target.center.lat],
      zoom: target.zoom,
      pitch: 0,
      bearing: 0,
      duration: 350,
      padding: { left: 0, right: 0, top: 0, bottom: 0, ...padding },
    });
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancelDrawing();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        undoDrawingPoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Drawing controls intentionally use the current refs rather than restarting Terra Draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.drawing]);

  // Imported files and redraws arrive through props; mirror them into Terra Draw once.
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !props.drawing) return;
    const signature = props.boundary ? JSON.stringify(props.boundary.geometry.coordinates) : "";
    if (signature === drawSignature.current) return;
    draw.clear();
    drawSignature.current = signature;
    if (props.boundary) {
      draw.addFeatures([{ type: "Feature", properties: { mode: "polygon" }, geometry: props.boundary.geometry }]);
      draw.setMode("select");
      const polygonId = draw.getSnapshot().find((feature) => feature.geometry.type === "Polygon")?.id;
      if (polygonId !== undefined) draw.selectFeature(polygonId);
    } else {
      draw.setMode("polygon");
    }
  }, [props.boundary, props.drawing]);

  // pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pin) {
      pinMarker.current?.remove();
      pinMarker.current = null;
      return;
    }
    if (!pinMarker.current) {
      pinMarker.current = new maplibregl.Marker({ element: pinElement(), anchor: "bottom", draggable: !!onPick })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      pinMarker.current.on("dragend", () => {
        const ll = pinMarker.current!.getLngLat();
        latest.current.onPick?.({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      pinMarker.current.setLngLat([pin.lng, pin.lat]);
      pinMarker.current.setDraggable(!!onPick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.lat, pin?.lng, !!onPick]);

  // numbered markers (e.g. safer alternatives)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    extraMarkers.current.forEach((m) => m.remove());
    extraMarkers.current = (props.markers ?? []).map((mk) => {
      const el = document.createElement("button");
      if (mk.type === "poi") {
        el.className = mk.active ? "ll-poi is-active" : "ll-poi";
        el.style.setProperty("--c", mk.color);
        const dot = document.createElement("span");
        dot.className = "ll-poi-dot";
        const txt = document.createElement("span");
        txt.className = "ll-poi-text";
        txt.textContent = mk.label;
        el.appendChild(dot);
        el.appendChild(txt);
        el.title = mk.label;
      } else {
        el.className = "ll-alt";
        el.style.setProperty("--c", mk.color);
        el.textContent = mk.label;
        el.setAttribute("aria-label", `Alternative ${mk.label}`);
      }
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        latest.current.onMarkerClick?.(mk.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(map);
    });
  }, [props.markers]);

  // radar sweep while investigating (drawn flat on the map plane)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (scanning && pin) {
      if (!scanMarker.current) {
        const el = document.createElement("div");
        el.className = "ll-scan";
        scanMarker.current = new maplibregl.Marker({ element: el, pitchAlignment: "map", rotationAlignment: "map" })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map);
      }
      scanMarker.current.setLngLat([pin.lng, pin.lat]);
      sizeScan();
    } else {
      scanMarker.current?.remove();
      scanMarker.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, pin?.lat, pin?.lng, radiusM]);

  // Camera and panel padding must be applied together. When a place is selected,
  // the workspace opens in the same render; applying padding in a second map call
  // cancels MapLibre's fly-to and leaves the first click at globe zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    const nextPadding = { left: 0, right: 0, top: 0, bottom: 0, ...padding };

    if (appliedCameraKey.current === camera.key) {
      map.setPadding(nextPadding);
      return;
    }
    appliedCameraKey.current = camera.key;
    const opts = {
      center: [camera.center.lng, camera.center.lat] as [number, number],
      zoom: camera.zoom,
      pitch: camera.pitch ?? 0,
      bearing: camera.bearing ?? 0,
      padding: nextPadding,
      duration: camera.duration ?? (camera.mode === "ease" ? 900 : 3200),
      essential: true,
    };
    if (camera.mode === "ease") map.easeTo(opts);
    else map.flyTo({ ...opts, curve: 1.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.key, padding?.left, padding?.right, padding?.top, padding?.bottom]);

  return (
    <div className={`${className ?? ""} ${props.drawing ? "is-drawing" : ""}`}>
      <div ref={box} className="h-full w-full bg-ink-950" />
      {props.drawing && (
        <div
          className="pointer-events-none absolute right-0 z-10 flex justify-center px-3"
          style={{ left: padding?.left ?? 0, top: padding?.left ? 64 : 112 }}
        >
          <div className="panel pointer-events-auto flex max-w-[620px] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl px-3 py-2 shadow-xl" role="status">
            <p className="text-[12.5px] font-medium text-tx">Click each corner. Click the first point to finish. <span className="text-tx-3">Esc to cancel.</span></p>
            <span className="rounded-md bg-chip px-2 py-1 font-mono text-[10.5px] text-tx-2" aria-live="polite">
              {draftMetrics
                ? `${Math.round(draftMetrics.areaM2).toLocaleString()} m² · ${draftMetrics.acres.toFixed(2)} acres · ${draftMetrics.guntas.toFixed(1)} guntas`
                : `${draftVertices} ${draftVertices === 1 ? "corner" : "corners"}`}
            </span>
            <button type="button" onClick={undoDrawingPoint} disabled={!canUndo} className="rounded-md border border-line px-2 py-1 text-[11px] text-tx disabled:cursor-not-allowed disabled:opacity-40">
              Undo last point <span className="text-tx-3">(Backspace)</span>
            </button>
            <button type="button" onClick={cancelDrawing} className="rounded-md border border-line px-2 py-1 text-[11px] text-tx hover:bg-chip">Cancel</button>
          </div>
        </div>
      )}
      {hasGoogleTiles && (
        <div className="ll-gattr pointer-events-none absolute bottom-2 right-14 z-10 flex items-center gap-2">
          <img src="https://maps.gstatic.com/mapfiles/api-3/images/google_white5.png" alt="Google" height={14} className="h-[14px] w-auto" />
          {copyright && <span>{copyright}</span>}
        </div>
      )}
    </div>
  );
}
