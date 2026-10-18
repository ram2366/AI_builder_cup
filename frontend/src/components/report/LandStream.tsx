import { motion } from "motion/react";
import type { Evidence } from "../../lib/types";

const LAYERS = [
  { key: "water", label: "Water", color: "var(--color-water)" },
  { key: "green", label: "Trees and grass", color: "#5f9e7a" },
  { key: "crops", label: "Crops", color: "#c9a548" },
  { key: "bare", label: "Bare ground", color: "#a08f7a" },
  { key: "built", label: "Built-up", color: "var(--color-built)" },
] as const;

type Key = (typeof LAYERS)[number]["key"];

/** Smooth closed band between two polylines (Catmull-Rom). */
function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * "What the land became": a centred streamgraph of land cover, 2016 → today. Bands narrow and widen
 * as the land changes, and are labelled in place at both ends so no legend lookup is needed.
 */
export function LandStream({ ev }: { ev: Evidence }) {
  const lc = ev.landcover;
  if (!lc) return null;
  const years = Object.keys(lc.by_year).sort();
  if (years.length < 3) return null;
  const val = (y: string, k: Key) => {
    const c = lc.by_year[y];
    return { water: c.water + c.flooded_vegetation, green: c.trees + c.grass + c.shrub_and_scrub, crops: c.crops, bare: c.bare + c.snow_and_ice, built: c.built }[k];
  };
  const W = 600;
  const H = 200;
  const padL = 46;
  const padR = 130;
  const mid = H / 2 - 6;
  const scale = (H - 40) / 1.0;
  const x = (i: number) => padL + (i / (years.length - 1)) * (W - padL - padR);

  // Stack centred on the midline (silhouette offset).
  const bands = LAYERS.map(() => ({ lower: [] as [number, number][], upper: [] as [number, number][] }));
  years.forEach((y, i) => {
    const total = LAYERS.reduce((s, l) => s + val(y, l.key), 0) || 1;
    let acc = mid - (total * scale) / 2;
    LAYERS.forEach((l, li) => {
      const h = val(y, l.key) * scale;
      bands[li].lower.push([x(i), acc]);
      bands[li].upper.push([x(i), acc + h]);
      acc += h;
    });
  });

  const first = years[0];
  const last = years[years.length - 1];
  const pct = (y: string, k: Key) => Math.round(val(y, k) * 100);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Land cover from ${first} to ${last}`}>
        {LAYERS.map((l, li) => {
          const lo = bands[li].lower;
          const up = [...bands[li].upper].reverse();
          const d = `${smooth(lo)} L${up[0][0]},${up[0][1]} ${smooth(up).slice(1)} Z`;
          return (
            <motion.path
              key={l.key}
              d={d}
              fill={l.color}
              fillOpacity={0.82}
              stroke="var(--color-ink-850)"
              strokeWidth="1"
              initial={{ opacity: 0, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              style={{ originY: `${mid}px` }}
              transition={{ delay: li * 0.08, duration: 0.6 }}
            />
          );
        })}
        {LAYERS.map((l, li) => {
          const a = (bands[li].lower[0][1] + bands[li].upper[0][1]) / 2;
          const b = (bands[li].lower[years.length - 1][1] + bands[li].upper[years.length - 1][1]) / 2;
          const showA = pct(first, l.key) >= 4;
          const showB = pct(last, l.key) >= 4;
          return (
            <g key={l.key} fontFamily="var(--font-mono)" fontSize="10.5">
              {showA && (
                <text x={padL - 8} y={a + 3.5} textAnchor="end" fill="var(--color-tx-2)">
                  {pct(first, l.key)}%
                </text>
              )}
              {showB && (
                <text x={W - padR + 8} y={b + 3.5} fill="var(--color-tx-2)">
                  {pct(last, l.key)}% <tspan fill="var(--color-tx-3)" fontFamily="var(--font-sans)">{l.label}</tspan>
                </text>
              )}
            </g>
          );
        })}
        <text x={x(0)} y={H - 4} textAnchor="middle" fontSize="10.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">{first}</text>
        <text x={x(years.length - 1)} y={H - 4} textAnchor="middle" fontSize="10.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">{last}</text>
      </svg>
    </figure>
  );
}
