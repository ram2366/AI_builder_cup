// Evidence layers drawn on the map.
// With mock evidence these are ILLUSTRATIVE shapes derived from the numbers (the UI labels them so).
// With Earth Engine they become real raster tiles of the same layers.

import type { Overlay } from "../components/MapCanvas";
import { blob, shift, type LatLng } from "./geo";
import type { Dimension, Evidence } from "./types";

export type LayerId = "water" | "flood" | "built" | "lowlying" | "ndvi" | "lst";

export interface LayerDef {
  id: LayerId;
  label: string;
  color: string;
  dimension: Dimension;
  ramp: string[];
  minLabel: string;
  maxLabel: string;
  shows: string;
  watchOut: string;
}

export const LAYERS: LayerDef[] = [
  {
    id: "water",
    label: "Historic water (JRC)",
    color: "#3b82f6",
    dimension: "water_body",
    ramp: ["#9ecbff", "#3b82f6", "#1e3a8a"],
    minLabel: "Occasional",
    maxLabel: "Almost always",
    shows: "How often each spot was under water in the historic satellite record.",
    watchOut: "Misses ponds under about 30 m and some cloudy monsoon months.",
  },
  {
    id: "flood",
    label: "Flood extent (radar)",
    color: "#a855f7",
    dimension: "flood",
    ramp: ["#a855f7"],
    minLabel: "Not flooded",
    maxLabel: "Flooded",
    shows: "Ground that turned to standing water during the detected Sentinel-1 flood event.",
    watchOut: "Often misses floods between tall buildings.",
  },
  {
    id: "built",
    label: "Built-up growth",
    color: "#f27a8c",
    dimension: "green",
    ramp: ["#f27a8c"],
    minLabel: "Unchanged",
    maxLabel: "New construction",
    shows: "Land built up in the recent comparison window that was not built up in the baseline window.",
    watchOut: "Soft land-cover probabilities can confuse bright bare soil with new construction.",
  },
  {
    id: "lowlying",
    label: "Low-lying terrain",
    color: "#f59e0b",
    dimension: "terrain",
    ramp: ["#f59e0b", "#fcd34d"],
    minLabel: "Lower",
    maxLabel: "Higher",
    shows: "Land less than 5 m above the nearest mapped drain, where water may collect first.",
    watchOut: "Terrain models do not capture every wall, culvert or recently changed drain.",
  },
  {
    id: "ndvi",
    label: "Vegetation health (NDVI)",
    color: "#2c8466",
    dimension: "land_health",
    ramp: ["#8b7d68", "#d8c98b", "#78b66f", "#226b52"],
    minLabel: "Bare / built",
    maxLabel: "Healthy vegetation",
    shows: "How green the land is in clear Sentinel-2 observations.",
    watchOut: "Season, irrigation and cloud filtering can change greenness without a permanent land change.",
  },
  {
    id: "lst",
    label: "May surface heat",
    color: "#d9531e",
    dimension: "land_health",
    ramp: ["#396ab1", "#76c6c3", "#f4d35e", "#ee964b", "#be3f57"],
    minLabel: "Cooler",
    maxLabel: "Hottest",
    shows: "May ground-surface temperature from Landsat 8/9, relative to the surrounding area.",
    watchOut: "This is surface temperature, not the air temperature people feel.",
  },
];

export interface LayerEvidenceDetails {
  source: string;
  resolution: string;
  period: string;
  unavailableReason: string | null;
}

function metres(value: number | undefined): string {
  return value === undefined ? "Not available for this plot" : `${value.toLocaleString()} m`;
}

/** Labels shown in the layer explainer come only from evidence returned for this report. */
export function layerEvidenceDetails(id: LayerId, ev: Evidence): LayerEvidenceDetails {
  const have = new Set(availableLayers(ev));
  const unavailable = !have.has(id);
  if (id === "water") {
    const evidence = ev.jrc ?? ev.water_years;
    const waterYears = Object.keys(ev.water_years?.by_year ?? {}).sort();
    return {
      source: evidence?.source ?? "Not available for this plot",
      resolution: metres(evidence?.resolution_m),
      period: ev.jrc?.period ?? (waterYears.length ? `${waterYears[0]}–${waterYears.at(-1)}` : "Not available for this plot"),
      unavailableReason: unavailable
        ? ev.jrc
          ? `No water signal was found here in the ${ev.jrc.period} record.`
          : "No historic-water record is available for this plot."
        : null,
    };
  }
  if (id === "flood") {
    return {
      source: ev.s1?.source ?? "Not available for this plot",
      resolution: metres(ev.s1?.resolution_m),
      period: ev.s1?.event ?? "Not available for this plot",
      unavailableReason: unavailable
        ? ev.s1
          ? `The detected event covered less than ${Math.round(ev.s1.flooded_fraction_aoi * 100)}% of this plot.`
          : "No Sentinel-1 flood event is available for this plot."
        : null,
    };
  }
  if (id === "built") {
    const windows = ev.landcover?.comparison_windows;
    const years = Object.keys(ev.landcover?.by_year ?? {}).sort();
    return {
      source: ev.landcover?.source ?? "Not available for this plot",
      resolution: metres(ev.landcover?.resolution_m),
      period: windows
        ? `${windows.baseline.period} compared with ${windows.recent.period}`
        : years.length > 1
          ? `${years[0]} compared with ${years.at(-1)}`
          : "Not available for this plot",
      unavailableReason: unavailable
        ? ev.landcover
          ? "No strong new built-up signal was found between the comparison windows."
          : "Land-cover comparison is unavailable for this plot."
        : null,
    };
  }
  if (id === "lowlying") {
    const terrain = ev.terrain;
    return {
      source: terrain ? `${terrain.source} · ${terrain.drainage_source}` : "Not available for this plot",
      resolution: terrain ? `${metres(terrain.resolution_m)} terrain · ${metres(terrain.drainage_resolution_m)} drainage` : "Not available for this plot",
      period: "Not supplied for these terrain products",
      unavailableReason: unavailable
        ? terrain
          ? "This plot does not meet the low-lying terrain threshold."
          : "Terrain evidence is unavailable for this plot."
        : null,
    };
  }
  const health = ev.land_health;
  if (id === "ndvi") {
    return {
      source: health?.source ?? "Not available for this plot",
      resolution: metres(health?.resolution_m),
      period: health?.period ?? "Not available for this plot",
      unavailableReason: unavailable ? "No usable NDVI observations are available for this plot." : null,
    };
  }
  return {
    source: health?.lst_source ?? "Not available for this plot",
    resolution: metres(health?.lst_resolution_m),
    period: health?.period ?? "Not available for this plot",
    unavailableReason: unavailable ? "No usable May surface-temperature observations are available for this plot." : null,
  };
}

export function layerForDimension(d: Dimension): LayerId | null {
  return LAYERS.find((l) => l.dimension === d)?.id ?? null;
}

export function availableLayers(ev: Evidence): LayerId[] {
  const out: LayerId[] = [];
  if ((ev.jrc && ev.jrc.occurrence_core_pct >= 5) || (ev.monsoon?.seen.length ?? 0) > 0) out.push("water");
  if (ev.s1 && ev.s1.flooded_fraction_aoi >= 0.03) out.push("flood");
  const years = ev.landcover ? Object.keys(ev.landcover.by_year).sort() : [];
  if (years.length >= 2) {
    const landcover = ev.landcover!;
    const baseline = landcover.comparison_windows?.baseline.mean ?? landcover.by_year[years[0]];
    const recent = landcover.comparison_windows?.recent.mean ?? landcover.by_year[years[years.length - 1]];
    if (recent.built - baseline.built >= 0.1) out.push("built");
  }
  if (ev.terrain && (ev.terrain.lower_than_500m_pct >= 60 || ev.terrain.relative_height_500m_m <= -1)) out.push("lowlying");
  if (ev.land_health && Object.values(ev.land_health.by_year).some((row) => row.ndvi_median !== null)) out.push("ndvi");
  if (ev.land_health && Object.values(ev.land_health.by_year).some((row) => row.lst_may_c !== null)) out.push("lst");
  return out;
}

/** Share of water inside the area for a year, 0-1: JRC yearly history up to 2021, then land cover. */
export function waterShare(ev: Evidence, year: string): number {
  const jrc = ev.water_years?.by_year[year];
  if (jrc !== undefined) return jrc;
  const c = ev.landcover?.by_year[year];
  return c ? c.water + c.flooded_vegetation : 0;
}

/** Every year with water information, oldest first (1984 onwards when JRC history is available). */
export function timelineYears(ev: Evidence): string[] {
  const ys = new Set([...Object.keys(ev.water_years?.by_year ?? {}), ...Object.keys(ev.landcover?.by_year ?? {})]);
  return [...ys].sort();
}

export function floodYear(ev: Evidence): number | null {
  return ev.s1 && ev.s1.flooded_fraction_aoi >= 0.03 ? Number(ev.s1.event.slice(0, 4)) : null;
}

export function buildOverlays(
  ev: Evidence,
  pin: LatLng,
  radiusM: number,
  visible: Record<LayerId, boolean>,
  year: string | null,
  tiles: Record<string, string> = {},
): Overlay[] {
  const real = Object.keys(tiles).length > 0;
  const seed = Math.abs(Math.round(pin.lat * 1000 + pin.lng * 1000));
  const have = new Set(availableLayers(ev));
  const years = timelineYears(ev);
  const maxWater = Math.max(0.01, ...years.map((y) => waterShare(ev, y)));
  const fy = floodYear(ev);
  const out: Overlay[] = [];

  if (have.has("water")) {
    // Follows the timeline: the historic water body shrinks as it was filled in.
    const share = year ? waterShare(ev, year) / maxWater : 1;
    out.push({
      id: "water",
      color: "#3b82f6",
      feature: blob(shift(pin, -radiusM * 0.1, radiusM * 0.28), radiusM * 0.55, seed),
      opacity: year ? 0.15 + 0.85 * share : 1,
      visible: visible.water,
    });
  }
  if (have.has("flood")) {
    const frac = ev.s1!.flooded_fraction_aoi;
    out.push({
      id: "flood",
      color: "#a855f7",
      feature: blob(shift(pin, radiusM * 0.12, -radiusM * 0.05), radiusM * Math.min(0.95, 0.35 + Math.sqrt(frac)), seed + 3),
      opacity: year && fy ? (Number(year) === fy ? 1 : 0.12) : 0.55,
      visible: visible.flood,
    });
  }
  if (have.has("built")) {
    out.push({
      id: "built",
      color: "#f27a8c",
      feature: blob(pin, radiusM * 0.85, seed + 7),
      opacity: year && years.length ? 0.2 + (0.8 * (years.indexOf(year) + 1)) / years.length : 0.8,
      visible: visible.built,
    });
  }
  if (have.has("lowlying")) {
    out.push({
      id: "lowlying",
      color: "#f59e0b",
      feature: blob(shift(pin, 0, radiusM * 0.1), radiusM * 1.35, seed + 11),
      opacity: 0.7,
      visible: visible.lowlying,
    });
  }
  if (have.has("ndvi")) {
    out.push({ id: "ndvi", color: "#2c8466", feature: blob(pin, radiusM, seed + 13), opacity: 0.72, visible: visible.ndvi });
  }
  if (have.has("lst")) {
    out.push({ id: "lst", color: "#d9531e", feature: blob(pin, radiusM, seed + 17), opacity: 0.68, visible: visible.lst });
  }
  // Real evidence: same layers, same timeline behaviour, but the actual satellite-derived pixels.
  return real ? out.map(({ feature: _f, ...o }) => ({ ...o, tiles: tiles[o.id] })).filter((o) => o.tiles) : out;
}
