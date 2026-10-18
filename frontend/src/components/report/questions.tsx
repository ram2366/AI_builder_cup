import type { ReactNode } from "react";
import { motion } from "motion/react";
import { CloudRain, Droplets, Leaf, Mountain, Trees, Umbrella } from "lucide-react";
import { timelineYears, waterShare } from "../../lib/layers";
import type { Dimension, Evidence, Level } from "../../lib/types";

/** The report checks, phrased as the questions buyers actually ask. */
export interface QuestionDef {
  dim: Dimension;
  icon: typeof Droplets;
  question: string;
  answers: Record<Level, string>;
  line: (ev: Evidence) => string;
  Viz: (p: { ev: Evidence; color: string }) => ReactNode;
}

const pct = (x: number) => Math.round(x * 100);

export const QUESTIONS: QuestionDef[] = [
  {
    dim: "water_body",
    icon: Droplets,
    question: "Was this land ever a lake?",
    answers: { high: "Yes", elevated: "Likely", moderate: "Nearby", low: "No" },
    line: (ev) =>
      !ev.jrc
        ? "No water history available"
        : ev.jrc.occurrence_core_pct < 1
          ? `No water recorded here since ${ev.jrc.period.slice(0, 4)}`
          : `Water seen here in ${ev.jrc.occurrence_core_pct}% of observations since ${ev.jrc.period.slice(0, 4)}`,
    Viz: WaterViz,
  },
  {
    dim: "flood",
    icon: CloudRain,
    question: "Does it flood?",
    answers: { high: "Often", elevated: "Sometimes", moderate: "Rarely", low: "No record" },
    line: (ev) => {
      const m = ev.monsoon;
      const base = m ? (m.seen.length ? `Water in ${m.seen.length} of ${m.observed_years} observed wet seasons` : `No water in ${m.observed_years} observed wet seasons`) : "No wet-season data";
      const f = ev.s1 && ev.s1.flooded_fraction_aoi >= 0.03 ? ` · flooded ${new Date(ev.s1.event).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : "";
      const historic = ev.historic_floods?.events.length ? ` · ${ev.historic_floods.events.length} mapped historic event(s)` : "";
      return base + f + historic;
    },
    Viz: FloodViz,
  },
  {
    dim: "terrain",
    icon: Mountain,
    question: "Is it low-lying?",
    answers: { high: "Very", elevated: "Yes", moderate: "Slightly", low: "No" },
    line: (ev) =>
      ev.terrain ? `FABDEM: ${ev.terrain.relative_height_500m_m > 0 ? "+" : ""}${ev.terrain.relative_height_500m_m} m vs nearby median · lower than ${ev.terrain.lower_than_500m_pct}% around` : "No terrain data",
    Viz: TerrainViz,
  },
  {
    dim: "green",
    icon: Trees,
    question: "Has greenery been lost?",
    answers: { high: "A lot", elevated: "Much", moderate: "Some", low: "Little" },
    line: (ev) => {
      const landcover = ev.landcover;
      if (!landcover) return "No land-cover data";
      const windows = landcover.comparison_windows;
      if (windows) {
        const green = (cover: typeof windows.baseline.mean) => cover.trees + cover.grass + cover.shrub_and_scrub;
        return `Green cover ${pct(green(windows.baseline.mean))}% → ${pct(green(windows.recent.mean))}% · ${windows.baseline.period} vs ${windows.recent.period}`;
      }
      const ys = Object.keys(landcover.green_by_year).sort();
      return `Green cover ${pct(landcover.green_by_year[ys[0]])}% → ${pct(landcover.green_by_year[ys[ys.length - 1]])}% since ${ys[0]}`;
    },
    Viz: GreenViz,
  },
  {
    dim: "rain",
    icon: Umbrella,
    question: "Heavy rain in the region?",
    answers: { high: "Frequent", elevated: "Frequent", moderate: "Some", low: "Rare" },
    line: (ev) => (ev.rain ? `About ${ev.rain.heavy_days_per_year_avg} very heavy rain days a year (regional)` : "No rainfall data"),
    Viz: RainViz,
  },
  {
    dim: "land_health",
    icon: Leaf,
    question: "Is land health declining?",
    answers: { high: "Severely", elevated: "Declining", moderate: "Hotter", low: "Stable" },
    line: (ev) => {
      const health = ev.land_health;
      if (!health) return "No land-health data";
      const trend = health.trends.ndvi;
      if (trend?.significant && trend.slope_per_year < 0) {
        return `NDVI ${trend.slope_per_year.toFixed(3)}/yr · ${health.ndvi_change?.toFixed(2) ?? "—"} across two-year windows`;
      }
      if (health.context.lst_may_delta_c !== null && health.context.lst_may_delta_c >= 3) {
        return `May surface is ${health.context.lst_may_delta_c.toFixed(1)} °C hotter than surroundings`;
      }
      return "No significant NDVI decline or local May heat signal";
    },
    Viz: HealthViz,
  },
];

/* ---------------- mini visuals ---------------- */

function WaterViz({ ev }: { ev: Evidence; color: string }) {
  const years = timelineYears(ev);
  if (years.length < 2) return null;
  const max = Math.max(0.01, ...years.map((y) => waterShare(ev, y)));
  const ticks = years.filter((y) => Number(y) % 10 === 0 || y === years[0] || y === years[years.length - 1]);
  return (
    <figure>
      <div className="flex h-14 items-end gap-px">
        {years.map((y, i) => (
          <motion.span
            key={y}
            title={`${y}: ${pct(waterShare(ev, y))}% water`}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.012, duration: 0.4 }}
            className="flex-1 origin-bottom rounded-t-[2px]"
            style={{ height: `${6 + 94 * (waterShare(ev, y) / max)}%`, background: "linear-gradient(180deg, #8fbdf8, #6aa7f540)" }}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between font-mono text-[10px] text-tx-3">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </figcaption>
    </figure>
  );
}

function FloodViz({ ev }: { ev: Evidence; color: string }) {
  const m = ev.monsoon;
  if (!m) return null;
  const years = Object.keys(m.obs_per_year).length ? Object.keys(m.obs_per_year).sort() : [];
  const fy = ev.s1 && ev.s1.flooded_fraction_aoi >= 0.03 ? Number(ev.s1.event.slice(0, 4)) : null;
  if (!years.length) return null;
  return (
    <figure>
      <div className="flex justify-between gap-1.5">
        {years.map((y, i) => {
          const wet = m.seen.includes(Number(y));
          const flood = Number(y) === fy;
          return (
            <div key={y} className="flex flex-1 flex-col items-center gap-1.5">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 400, damping: 18 }}
                className="grid h-7 w-7 place-items-center rounded-full"
                style={{
                  background: flood ? "#b794f6" : wet ? "#6aa7f5" : "rgba(255,255,255,0.06)",
                  boxShadow: flood ? "0 0 0 3px rgba(183,148,246,0.25), 0 0 14px rgba(183,148,246,0.55)" : wet ? "0 0 10px rgba(106,167,245,0.4)" : "none",
                }}
              >
                {(wet || flood) && <CloudRain className="h-3.5 w-3.5 text-ink-900" />}
              </motion.span>
              <span className="font-mono text-[10px] text-tx-3">{y.slice(2)}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-2 flex gap-3 text-[11px] text-tx-3">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#6aa7f5]" /> Water seen
        </span>
        {fy && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#b794f6]" /> Radar-confirmed flood
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-line-2" /> Dry
        </span>
      </figcaption>
    </figure>
  );
}

function TerrainViz({ ev, color }: { ev: Evidence; color: string }) {
  const t = ev.terrain;
  if (!t) return null;
  // Stylised cross-section: the plot sits where its elevation percentile puts it.
  const x = 40 + (260 * (100 - t.lower_than_500m_pct)) / 100;
  const ground = (px: number) => 52 - 30 * Math.exp(-(((px - 300) / 120) ** 2)) - 18 * Math.exp(-(((px - 40) / 90) ** 2)) + 10 * Math.exp(-(((px - 170) / 70) ** 2));
  const pts = Array.from({ length: 61 }, (_, i) => {
    const px = (i / 60) * 340;
    return `${px},${ground(px).toFixed(1)}`;
  }).join(" ");
  const py = ground(x);
  return (
    <figure>
      <svg viewBox="0 0 340 70" className="w-full">
        <defs>
          <linearGradient id="terr" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7cc79a" stopOpacity="0.45" />
            <stop offset="1" stopColor="#7cc79a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={`0,70 ${pts} 340,70`} fill="url(#terr)" />
        <polyline points={pts} fill="none" stroke="#a7e3c0" strokeWidth="1.5" />
        <line x1="0" x2="340" y1={py + 3} y2={py + 3} stroke="#6aa7f5" strokeDasharray="3 3" strokeWidth="1" opacity="0.6" />
        <motion.g initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          <line x1={x} x2={x} y1={py - 16} y2={py} stroke={color} strokeWidth="1.5" />
          <circle cx={x} cy={py - 18} r="4.5" fill={color} />
        </motion.g>
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[11px] text-tx-3">
        <span>Your plot ● is {Math.abs(t.relative_height_500m_m)} m {t.relative_height_500m_m <= 0 ? "below" : "above"} the 500 m median</span>
        <span>Higher than {100 - Math.round(t.lower_than_500m_pct)}% around</span>
      </figcaption>
    </figure>
  );
}

function GreenViz({ ev }: { ev: Evidence; color: string }) {
  const g = ev.landcover?.green_by_year;
  if (!g) return null;
  const ys = Object.keys(g).sort();
  const vals = ys.map((y) => g[y]);
  const W = 340;
  const H = 56;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 6 - v * (H - 12)}`);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="grn" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7cc79a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#7cc79a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="url(#grn)" />
        <motion.polyline
          points={pts.join(" ")}
          fill="none"
          stroke="#a7e3c0"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9 }}
        />
        <circle cx={pts[0].split(",")[0]} cy={pts[0].split(",")[1]} r="3.5" fill="#a7e3c0" />
        <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="3.5" fill="#f4a26e" />
      </svg>
      <figcaption className="mt-0.5 flex justify-between font-mono text-[10px] text-tx-3">
        <span>
          {ys[0]} · {pct(vals[0])}%
        </span>
        <span>
          {ys[ys.length - 1]} · {pct(vals[vals.length - 1])}%
        </span>
      </figcaption>
    </figure>
  );
}

function HealthViz({ ev, color }: { ev: Evidence; color: string }) {
  const health = ev.land_health;
  if (!health) return null;
  const points = Object.keys(health.by_year)
    .sort()
    .flatMap((year) => {
      const value = health.by_year[year].ndvi_median;
      return value === null ? [] : [{ year, value }];
    });
  if (points.length < 2) return null;
  const W = 340;
  const H = 60;
  const low = Math.min(...points.map((point) => point.value));
  const high = Math.max(...points.map((point) => point.value));
  const span = high - low || 1;
  const path = points.map((point, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * W},${H - 8 - ((point.value - low) / span) * (H - 16)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Yearly NDVI land-health trend">
        <line x1="0" x2={W} y1={H - 8} y2={H - 8} stroke="var(--color-line)" />
        <motion.path d={path} fill="none" stroke={color} strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} />
      </svg>
      <figcaption className="flex justify-between font-mono text-[10px] text-tx-3">
        <span>{points[0].year} · {points[0].value.toFixed(2)}</span>
        <span>{points.at(-1)!.year} · {points.at(-1)!.value.toFixed(2)}</span>
      </figcaption>
    </figure>
  );
}

function RainViz({ ev, color }: { ev: Evidence; color: string }) {
  if (!ev.rain) return null;
  const d = ev.rain.heavy_days_per_year_avg;
  const frac = Math.min(1, d / 8);
  return (
    <figure className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-chip">
        <motion.div initial={{ width: 0 }} animate={{ width: `${frac * 100}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: `linear-gradient(90deg, #6aa7f5, ${color})` }} />
      </div>
      <figcaption className="font-mono text-[11px] text-tx-2">{d} days/yr</figcaption>
    </figure>
  );
}
