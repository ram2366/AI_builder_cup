import { useEffect, useState, useSyncExternalStore } from "react";
import type { ViewState } from "./MapCanvas";

// Tiny external store so map telemetry re-renders only the HUD, not the whole app.
let view: ViewState | null = null;
const subs = new Set<() => void>();
export function publishView(v: ViewState) {
  view = v;
  subs.forEach((f) => f());
}
function useView() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => view,
  );
}

const fmtLat = (v: number) => `${Math.abs(v).toFixed(5)}°${v >= 0 ? "N" : "S"}`;
const fmtLng = (v: number) => `${Math.abs(v).toFixed(5)}°${v >= 0 ? "E" : "W"}`;
const fmtAlt = (m: number) => (m >= 10_000 ? `${Math.round(m / 1000).toLocaleString()} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

function useUtc() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t.toISOString().slice(11, 19);
}

/**
 * Futuristic heads-up display over the map: frame brackets, faint grid, scan line and live telemetry.
 * Purely decorative chrome; pointer events pass through to the map.
 */
export function Hud({ status, insetLeft = 0, compact = false }: { status: string; insetLeft?: number; compact?: boolean }) {
  const v = useView();
  const utc = useUtc();
  const pos = v?.cursor ?? (v ? { lat: v.lat, lng: v.lng } : null);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" style={{ left: insetLeft }} aria-hidden>
      <div className="hud-grid absolute inset-0" />
      <div className="hud-scan" />

      {/* frame brackets */}
      <span className="hud-corner left-3 top-3 border-l-2 border-t-2" />
      <span className="hud-corner right-3 top-3 border-r-2 border-t-2" />
      <span className="hud-corner bottom-3 left-3 border-b-2 border-l-2" />
      <span className="hud-corner bottom-3 right-3 border-b-2 border-r-2" />

      {/* centre crosshair ticks */}
      <span className="absolute left-1/2 top-3 h-2.5 w-px bg-teal-300/50" />
      <span className="absolute bottom-3 left-1/2 h-2.5 w-px bg-teal-300/50" />
      <span className="absolute left-3 top-1/2 h-px w-2.5 bg-teal-300/50" />
      <span className="absolute right-3 top-1/2 h-px w-2.5 bg-teal-300/50" />

      {!compact && v && (
        <>
          {/* left telemetry column */}
          <div className="hud-text absolute right-7 top-1/2 flex -translate-y-1/2 flex-col items-end gap-3 text-right">
            <Readout k="ALT" val={fmtAlt(v.altitudeM)} />
            <Readout k="HDG" val={`${String(Math.round((v.bearing + 360) % 360)).padStart(3, "0")}°`} />
            <Readout k="TILT" val={`${Math.round(v.pitch)}°`} />
            <Readout k="ZOOM" val={v.zoom.toFixed(1)} />
          </div>

          {/* bottom telemetry strip */}
          <div className="hud-text absolute left-1/2 top-[22px] flex -translate-x-1/2 items-center gap-5 whitespace-nowrap">
            <span>
              <span className="hud-dim">{v.cursor ? "CURSOR" : "CENTER"} </span>
              {pos ? `${fmtLat(pos.lat)}  ${fmtLng(pos.lng)}` : "—"}
            </span>
            <span className="hud-dim">|</span>
            <span>
              <span className="hud-dim">UTC </span>
              {utc}
            </span>
            <span className="hud-dim">|</span>
            <span className="flex items-center gap-1.5">
              <span className="hud-blink h-1.5 w-1.5 rounded-full bg-teal-300" />
              {status}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Readout({ k, val }: { k: string; val: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="hud-dim text-[9.5px]">{k}</span>
      <span className="text-[12px]">{val}</span>
    </div>
  );
}

/** One muted telemetry line for the corner of the map (replaces the full HUD). */
export function MapReadout({ insetLeft = 0 }: { insetLeft?: number }) {
  const v = useView();
  if (!v) return null;
  const pos = v.cursor ?? { lat: v.lat, lng: v.lng };
  return (
    <p className="map-readout" style={{ left: insetLeft + 16 }} aria-hidden>
      {fmtLat(pos.lat)} {fmtLng(pos.lng)} · ALT {fmtAlt(v.altitudeM)}
    </p>
  );
}
