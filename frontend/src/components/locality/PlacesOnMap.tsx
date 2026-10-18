import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ExternalLink, GraduationCap, HeartPulse, ShoppingCart, Star, Train, Trees, Utensils, X } from "lucide-react";
import type { POICategory, POIItem } from "../../lib/types";

export const POI_CATEGORIES: { id: POICategory; label: string; color: string; icon: typeof Train }[] = [
  { id: "transit", label: "Transit", color: "#3b82f6", icon: Train },
  { id: "grocery", label: "Groceries", color: "#10b981", icon: ShoppingCart },
  { id: "healthcare", label: "Healthcare", color: "#ec4899", icon: HeartPulse },
  { id: "education", label: "Schools", color: "#8b5cf6", icon: GraduationCap },
  { id: "social", label: "Dining & social", color: "#f59e0b", icon: Utensils },
  { id: "green", label: "Parks & green", color: "#14b8a6", icon: Trees },
];

export type PoiLimits = Record<POICategory, number>;
export const DEFAULT_POI_LIMITS: PoiLimits = { transit: 2, grocery: 2, healthcare: 2, education: 2, social: 2, green: 2 };
const MAX_PER_CATEGORY = 10;

/** The nearest N places of each category, plus the selected one, so the map stays readable. */
export function pickPlaces(pois: POIItem[], limits: PoiLimits, selectedId: string | null): POIItem[] {
  const out: POIItem[] = [];
  for (const c of POI_CATEGORIES) {
    out.push(...pois.filter((p) => p.category === c.id).sort((a, b) => a.distance_m - b.distance_m).slice(0, limits[c.id]));
  }
  const sel = selectedId ? pois.find((p) => p.id === selectedId) : null;
  if (sel && !out.some((p) => p.id === sel.id)) out.push(sel);
  return out;
}

const dist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

/** Map control: how many places to show for each category. */
export function PlacesControl({ pois, limits, onChange, defaultOpen }: { pois: POIItem[]; limits: PoiLimits; onChange: (l: PoiLimits) => void; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = POI_CATEGORIES.reduce((n, c) => n + Math.min(limits[c.id], pois.filter((p) => p.category === c.id).length), 0);
  return (
    <section className="places-control panel on-map" aria-label="Places shown on the map">
      <button type="button" className="places-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          <b>Places on map</b>
          <em>{shown} shown</em>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="places-body">
          {POI_CATEGORIES.map((c) => {
            const available = pois.filter((p) => p.category === c.id).length;
            const max = Math.min(MAX_PER_CATEGORY, available);
            const value = Math.min(limits[c.id], max);
            const Icon = c.icon;
            return (
              <div key={c.id} className={`places-row ${available === 0 ? "is-empty" : ""}`}>
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.color }} aria-hidden />
                <label htmlFor={`places-${c.id}`}>{c.label}</label>
                <input
                  id={`places-${c.id}`}
                  type="range"
                  min={0}
                  max={Math.max(max, 1)}
                  step={1}
                  value={value}
                  disabled={available === 0}
                  onChange={(e) => onChange({ ...limits, [c.id]: Number(e.target.value) })}
                  className="ll-range"
                  style={{ "--pct": `${max ? (value / max) * 100 : 0}%` } as React.CSSProperties}
                  aria-valuetext={`${value} of ${available} nearby`}
                />
                <span className="num">{available === 0 ? "none" : `${value}/${available}`}</span>
              </div>
            );
          })}
          <p className="places-note">Nearest first. Click a place on the map for details.</p>
        </div>
      )}
    </section>
  );
}

/** Details for the place the user clicked. */
export function PlaceCard({ poi, onClose }: { poi: POIItem; onClose: () => void }) {
  const cat = POI_CATEGORIES.find((c) => c.id === poi.category)!;
  const Icon = cat.icon;
  const walk = Math.max(1, Math.round(poi.distance_m / 80));
  return (
    <motion.aside initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18 }} className="place-card panel on-map" role="dialog" aria-label={`${poi.name} details`}>
      <button type="button" onClick={onClose} aria-label="Close place details" className="place-x"><X className="h-4 w-4" /></button>
      <span className="place-cat" style={{ color: cat.color, background: `${cat.color}1f` }}>
        <Icon className="h-3.5 w-3.5" aria-hidden /> {cat.label}
      </span>
      <h3>{poi.name}</h3>
      {poi.detail && <p className="place-detail">{poi.detail}</p>}
      <dl className="place-facts">
        <div><dt>Distance</dt><dd className="num">{dist(poi.distance_m)}</dd></div>
        <div><dt>On foot</dt><dd className="num">{walk} min</dd></div>
        {poi.rating != null && (
          <div>
            <dt>Rating</dt>
            <dd className="num inline-flex items-center gap-1"><Star className="h-3 w-3 fill-current text-warn" aria-hidden />{poi.rating.toFixed(1)}{poi.ratings != null && <small> ({poi.ratings.toLocaleString()})</small>}</dd>
          </div>
        )}
      </dl>
      <p className="place-src">Source: Google Places</p>
      {poi.maps_uri && (
        <a href={poi.maps_uri} target="_blank" rel="noreferrer" className="place-link">
          Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </motion.aside>
  );
}
