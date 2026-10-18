import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Layers, LocateFixed, Map as MapIcon, PenTool, Satellite } from "lucide-react";
import type { Basemap } from "../MapCanvas";

/** One vertical control group on the right edge of the map. Layers open as a popover. */
export function MapToolbar({
  basemap,
  onBasemap,
  layers,
  onDraw,
  drawActive,
  onLocate,
  compact,
}: {
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  layers?: ReactNode;
  onDraw?: () => void;
  drawActive?: boolean;
  onLocate: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || wrap.current?.querySelector("[data-layer-info-card]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (!layers) setOpen(false);
  }, [layers]);

  const icon = "h-[17px] w-[17px]";
  return (
    <div ref={wrap} className={`map-toolbar on-map ${compact ? "is-compact" : ""}`} role="toolbar" aria-label="Map tools" aria-orientation="vertical">
      <div className="map-toolbar-group panel">
        {layers && (
          <button type="button" aria-label="Layers" aria-pressed={open} aria-expanded={open} data-tip="Layers" onClick={() => setOpen((o) => !o)} className={open ? "is-on" : ""}>
            <Layers className={icon} />
          </button>
        )}
        {onDraw && (
          <button type="button" aria-label="Draw or import boundary" aria-pressed={drawActive} data-tip="Draw boundary" onClick={onDraw} className={drawActive ? "is-on" : ""}>
            <PenTool className={icon} />
          </button>
        )}
        {!compact && (
          <button
            type="button"
            aria-label={basemap === "satellite" ? "Switch to street map" : "Switch to satellite"}
            data-tip={basemap === "satellite" ? "Street map" : "Satellite"}
            onClick={() => onBasemap(basemap === "satellite" ? "streets" : "satellite")}
          >
            {basemap === "satellite" ? <MapIcon className={icon} /> : <Satellite className={icon} />}
          </button>
        )}
        <button type="button" aria-label="Locate me" data-tip="Locate me" onClick={onLocate}>
          <LocateFixed className={icon} />
        </button>
      </div>
      <AnimatePresence>
        {open && layers && (
          <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.16 }} className="map-popover">
            {layers}
            {compact && (
              <button type="button" onClick={() => onBasemap(basemap === "satellite" ? "streets" : "satellite")} className="mt-2 h-8 w-full rounded-lg border border-line text-[12.5px] text-tx">
                Basemap: {basemap === "satellite" ? "Satellite" : "Streets"}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
