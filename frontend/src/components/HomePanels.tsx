import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, CloudRain, Droplets, Layers, Mountain, Newspaper, Pencil, Radar, RotateCcw, Trees, Upload, X } from "lucide-react";
import { api } from "../lib/api";
import { boundaryMetrics, parseBoundaryFile, type BoundaryFeature } from "../lib/boundary";
import type { Example } from "../lib/types";
import { CommandSearch } from "./CommandSearch";
import type { Place } from "../lib/geocode";

const DOT: Record<string, string> = {
  "former-lake": "bg-risk-high",
  "high-ground": "bg-risk-low",
  jakarta: "bg-risk-elevated",
};

export function HomeHero({
  onSearch,
  onExample,
  extra,
}: {
  onSearch: (p: Place) => void;
  onExample: (e: Example) => void;
  extra?: ReactNode;
}) {
  const [examples, setExamples] = useState<Example[]>([]);
  const [examplesError, setExamplesError] = useState(false);
  useEffect(() => {
    api.examples().then((items) => {
      setExamples(items);
      setExamplesError(false);
    }).catch(() => {
      setExamples([]);
      setExamplesError(true);
    });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[560px]"
    >
      <p className="lbl !text-ac">Satellite due diligence for land</p>
      <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-tx sm:text-[52px]">
        See what your land was, before you buy it.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-tx-2 sm:text-[17px]">
        Forty years of water history, flood radar and land change, investigated by Gemini and verified claim by claim.
      </p>
      <div className="mt-7">
        <CommandSearch size="lg" onSelect={onSearch} />
      </div>
      {examples.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button
              key={e.id}
              onClick={() => onExample(e)}
              className="group flex items-center gap-2 rounded-[10px] border border-line bg-chip px-3 py-2 text-[13px] text-tx transition hover:border-line-2 hover:bg-chip"
            >
              <span className={`h-2 w-2 rounded-full ${DOT[e.id] ?? "bg-ac"}`} />
              {e.label} · {e.city}
              <ArrowRight className="h-3.5 w-3.5 text-tx-3 transition group-hover:translate-x-0.5 group-hover:text-tx" />
            </button>
          ))}
        </div>
      )}
      {examples[0]?.demo_data && (
        <p className="mt-3 text-xs text-warn">Demo mode: reports use illustrative data until Earth Engine is connected.</p>
      )}
      {examplesError && (
        <p role="alert" className="mt-3 text-xs text-warn">
          Example plots aren't available right now. You can still search for any place above.
        </p>
      )}
      {extra}
    </motion.div>
  );
}

export const SOURCES = ["Sentinel-1 radar", "Sentinel-2", "Dynamic World", "JRC Surface Water", "AlphaEarth", "Gemini"];
export type PlotShape = "circle" | "boundary";

const CHECKS = [
  { icon: Droplets, label: "Water history since 1984" },
  { icon: CloudRain, label: "Wet-season flooding" },
  { icon: Radar, label: "Radar flood maps" },
  { icon: Mountain, label: "Terrain and drainage" },
  { icon: Trees, label: "Land-use change" },
  { icon: Newspaper, label: "Local news" },
];

export function Inspector({
  label,
  lat,
  lng,
  radius,
  onRadius,
  shape,
  boundary,
  boundaryError,
  onShape,
  onBoundary,
  onInvestigate,
  onCheckLocality,
  onClose,
  embedded = false,
}: {
  label: string | null;
  lat: number;
  lng: number;
  radius: number;
  onRadius: (r: number) => void;
  shape: PlotShape;
  boundary: BoundaryFeature | null;
  boundaryError?: string | null;
  onShape: (shape: PlotShape) => void;
  onBoundary: (boundary: BoundaryFeature | null, focus?: boolean) => void;
  onInvestigate: () => void;
  onCheckLocality?: () => void;
  onClose: () => void;
  /** Inside the plot workspace, which already shows the plot name and close button. */
  embedded?: boolean;
}) {
  const pct = ((radius - 100) / 900) * 100;
  const fileInput = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const metrics = boundary ? boundaryMetrics(boundary) : null;
  const error = importError ?? boundaryError;

  const importBoundary = async (file: File | undefined) => {
    if (!file) return;
    try {
      const feature = parseBoundaryFile(await file.text(), file.name);
      setImportError(null);
      onShape("boundary");
      onBoundary(feature, true);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "This boundary file could not be read.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  return (
    <div className="p-5 sm:p-6">
      {!embedded && (
        <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="lbl">Selected plot</p>
          {label ? (
            <h2 className="mt-1.5 text-[21px] font-bold leading-snug tracking-tight text-tx">{label}</h2>
          ) : (
            <p className="mt-1.5 text-[15px] font-medium text-tx-2">Finding this address…</p>
          )}
          <p className="mt-1 font-mono text-xs text-tx-2">
            {Math.abs(lat).toFixed(5)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lng).toFixed(5)}° {lng >= 0 ? "E" : "W"}
          </p>
        </div>
        <button onClick={onClose} aria-label="Clear selection" className="rounded-lg p-1.5 text-tx-3 hover:bg-chip hover:text-tx">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="my-5 h-px bg-line-2" />

        </>
      )}

      <div className="grid grid-cols-2 rounded-xl border border-line bg-ink-900/60 p-1" role="radiogroup" aria-label="Plot shape">
        {(["circle", "boundary"] as PlotShape[]).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={shape === value}
            onClick={() => onShape(value)}
            className={`rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
              shape === value ? "bg-chip text-tx shadow-sm" : "text-tx-3 hover:text-tx"
            }`}
          >
            {value === "circle" ? "Circle" : "Draw / import"}
          </button>
        ))}
      </div>

      {shape === "circle" ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label htmlFor="radius" className="text-[13px] text-tx-2">Analysis radius</label>
            <span className="font-mono text-[13px] text-tx">{radius >= 1000 ? "1 km" : `${radius} m`}</span>
          </div>
          <input
            id="radius"
            type="range"
            min={100}
            max={1000}
            step={50}
            value={radius}
            onChange={(e) => onRadius(Number(e.target.value))}
            className="ll-range mt-3 w-full"
            style={{ "--pct": `${pct}%` } as React.CSSProperties}
          />
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-tx-3">
            <span>100 m</span><span>500 m</span><span>1 km</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-line bg-chip p-3.5">
          {metrics ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-tx">Custom boundary ready</p>
                  <p className="mt-1 font-mono text-[12px] text-tx-2">
                    {Math.round(metrics.areaM2).toLocaleString()} m² · {metrics.acres.toFixed(2)} acres · {metrics.guntas.toFixed(1)} guntas
                  </p>
                  <p className="mt-1 text-[11.5px] text-tx-3">Perimeter {Math.round(metrics.perimeterM).toLocaleString()} m · {metrics.vertices} points</p>
                </div>
                <button type="button" onClick={() => onBoundary(null)} className="rounded-lg p-1.5 text-tx-3 hover:bg-line hover:text-tx" aria-label="Redraw boundary">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-tx-3">Drag a corner on the map to edit it. Press Delete to remove a selected point.</p>
            </>
          ) : (
            <div className="flex items-start gap-2.5">
              <Pencil className="mt-0.5 h-4 w-4 text-ac" />
              <div>
                <p className="text-[13px] font-semibold text-tx">Click the map to draw the plot</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-tx-3">Add at least 3 corners, then click the first point to close it.</p>
              </div>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json"
            className="hidden"
            onChange={(event) => void importBoundary(event.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-line bg-ink-900/50 text-[12.5px] font-semibold text-tx hover:bg-line"
          >
            <Upload className="h-3.5 w-3.5" /> Import KML or GeoJSON
          </button>
          {error && <p role="alert" className="mt-2 text-[12px] leading-snug text-risk-high">{error}</p>}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-line bg-chip p-3.5">
        <p className="lbl mb-2.5 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" /> What we'll check
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {CHECKS.map(({ icon: Icon, label: l }) => (
            <span key={l} className="flex items-center gap-2 text-[12.5px] text-tx-2">
              <Icon className="h-3.5 w-3.5 text-ac/80" /> {l}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={onInvestigate}
        disabled={shape === "boundary" && (!boundary || !!error)}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ac text-[15px] font-semibold text-ac-ink shadow-[0_10px_30px_rgb(61_214_198_/_0.2)] transition hover:bg-ac-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Analyse this {shape === "boundary" ? "boundary" : "plot"} <ArrowRight className="h-4 w-4" />
      </button>
      {onCheckLocality && (
        <button
          type="button"
          onClick={onCheckLocality}
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-chip text-[14px] font-semibold text-tx transition hover:bg-line active:scale-[0.99]"
        >
          <span>🏙️</span> Check Locality & Amenities
        </button>
      )}
      <p className="mt-2.5 text-center text-[11.5px] text-tx-3">Water history · Floods · Ground height · Greenery · about 40 s. Neighbourhood loads when you open its tab.</p>
    </div>
  );
}
