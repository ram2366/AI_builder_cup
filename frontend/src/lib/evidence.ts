import type { Dimension, Evidence, Level } from "./types";

export const LEVEL_STYLE: Record<Level, { label: string; color: string; soft: string; text: string; tile: string; tint: string }> = {
  high: { label: "High", color: "var(--color-risk-high)", soft: "var(--color-risk-high-soft)", text: "text-risk-high-tx", tile: "bg-risk-high-soft border-risk-high/30", tint: "from-risk-high-soft to-transparent border-risk-high/30" },
  elevated: { label: "Elevated", color: "var(--color-risk-elevated)", soft: "var(--color-risk-elevated-soft)", text: "text-risk-elevated-tx", tile: "bg-risk-elevated-soft border-risk-elevated/30", tint: "from-risk-elevated-soft to-transparent border-risk-elevated/30" },
  moderate: { label: "Moderate", color: "var(--color-risk-moderate)", soft: "var(--color-risk-moderate-soft)", text: "text-risk-moderate-tx", tile: "bg-risk-moderate-soft border-risk-moderate/30", tint: "from-risk-moderate-soft to-transparent border-risk-moderate/30" },
  low: { label: "Low", color: "var(--color-risk-low)", soft: "var(--color-risk-low-soft)", text: "text-risk-low-tx", tile: "bg-risk-low-soft border-risk-low/30", tint: "from-risk-low-soft to-transparent border-risk-low/30" },
};

export const DIMENSION_LABEL: Record<Dimension, string> = {
  water_body: "Water body",
  flood: "Flooding",
  terrain: "Terrain",
  green: "Green loss",
  land_health: "Land health",
  rain: "Rain",
};

export const DIMENSION_LONG: Record<Dimension, string> = {
  water_body: "Former water body",
  flood: "Flooding and waterlogging",
  terrain: "Low-lying terrain",
  green: "Green cover loss",
  land_health: "Land health decline / heat",
  rain: "Heavy rain (regional)",
};

export const DIMENSION_ORDER: Dimension[] = ["water_body", "flood", "terrain", "land_health", "green", "rain"];

const SECTION_LABEL: Record<string, string> = {
  landcover: "Land cover · Dynamic World · 10 m",
  land_health: "Land health · Sentinel-2 10 m / Landsat 30 m",
  jrc: "Water history · JRC · 30 m",
  monsoon: "Local wet-season scenes · Dynamic World · 10 m",
  terrain: "Plot terrain · FABDEM · 30 m",
  buildings: "Building history · Google Open Buildings · 4 m",
  historic_floods: "Historic flood events · Global Flood Database · ~250 m",
  flood_hazard: "Regional flood hazard · WRI Aqueduct · 1 km",
  s1: "Radar · Sentinel-1 · 10 m",
  vision: "Gemini reading of satellite images",
  images: "Sentinel-2 images",
  rain: "Rainfall · CHIRPS · ~5.5 km",
  embedding: "AlphaEarth embeddings · 10 m",
  news: "Local news (Google Search)",
};

export function sectionLabel(ref: string): string {
  return SECTION_LABEL[ref.split(".")[0]] ?? ref;
}

export function resolveRef(ev: Evidence, ref: string): unknown {
  let cur: unknown = ev;
  for (const part of ref.split(".")) {
    if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (cur && typeof cur === "object" && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

export function formatValue(v: unknown): string {
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object") return `${v.length} item(s)`;
    return v.length ? v.join(", ") : "none";
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v ?? "n/a");
}
