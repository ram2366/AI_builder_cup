import { useId } from "react";
import { motion } from "motion/react";
import { floodYear, timelineYears, waterShare } from "../../lib/layers";
import type { Evidence } from "../../lib/types";

interface Chapter {
  title: string;
  span: string;
  from: number;
  to: number;
}

/** Finds the story in the 40-year water series: how long water stayed, when it disappeared. */
export function storyChapters(ev: Evidence): { years: string[]; values: number[]; wet?: Chapter; fill?: Chapter; flood: number | null } {
  const years = timelineYears(ev);
  const values = years.map((y) => waterShare(ev, y));
  const flood = floodYear(ev);
  if (years.length < 4) return { years, values, flood };
  const max = Math.max(...values);
  if (max < 0.05) return { years, values, flood };
  const wetIdx = values.map((v, i) => (v >= max * 0.6 ? i : -1)).filter((i) => i >= 0);
  const firstWet = wetIdx[0];
  const lastWet = wetIdx[wetIdx.length - 1];
  const wet: Chapter = {
    title: "Water most years",
    span: `${years[firstWet]} – ${years[lastWet]}`,
    from: firstWet,
    to: lastWet,
  };
  let dry = values.findIndex((v, i) => i > lastWet && v < max * 0.15);
  if (dry < 0) dry = values.length - 1;
  const fill: Chapter | undefined =
    dry > lastWet + 1 ? { title: "Water disappears", span: `${years[lastWet + 1]} – ${years[dry]}`, from: lastWet + 1, to: dry } : undefined;
  return { years, values, wet, fill, flood };
}

/**
 * The signature visual: share of the land under water each year since 1984, annotated with the
 * chapters of its story. `annotated` is the Overview reading; `axis` the Evidence reading.
 */
export function StoryChart({ ev, mode = "annotated", year }: { ev: Evidence; mode?: "annotated" | "axis"; year?: string | null }) {
  const gid = useId().replace(/:/g, "");
  const { years, values, wet, fill, flood } = storyChapters(ev);
  if (years.length < 4) return null;
  const W = 600;
  const H = mode === "annotated" ? 214 : 170;
  const padL = mode === "axis" ? 34 : 2;
  const padR = 6;
  const top = mode === "annotated" ? 50 : 14;
  const bot = H - 24;
  const max = Math.max(0.1, ...values) * 1.12;
  const x = (i: number) => padL + (i / (years.length - 1)) * (W - padL - padR);
  const y = (v: number) => bot - (v / max) * (bot - top);
  // Light smoothing (1-2-1) so year-to-year noise doesn't hide the story; the flood year stays sharp.
  const fIdx = flood !== null ? years.indexOf(String(flood)) : -1;
  const drawn = values.map((v, i) =>
    i === 0 || i === values.length - 1 || Math.abs(i - fIdx) <= 1 ? v : (values[i - 1] + 2 * v + values[i + 1]) / 4,
  );
  const pts = drawn.map((v, i) => [x(i), y(v)] as const);
  // Smooth curve (Catmull-Rom → cubic Bézier) so the story reads as a landscape, not a zig-zag.
  let line = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    line += ` C${c1[0].toFixed(1)},${Math.min(bot, c1[1]).toFixed(1)} ${c2[0].toFixed(1)},${Math.min(bot, c2[1]).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${line} L${x(years.length - 1)},${bot} L${x(0)},${bot} Z`;
  const fi = fIdx;
  const cur = year ? years.indexOf(year) : -1;
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const edgeTickClearance = 44;
  const ticks = years.filter((t) => {
    if (t === firstYear || t === lastYear) return true;
    if (Number(t) % 10 !== 0) return false;
    const px = x(years.indexOf(t));
    return px - x(0) >= edgeTickClearance && x(years.length - 1) - px >= edgeTickClearance;
  });
  const tickAnchor = (t: string) => (t === years[0] ? "start" : t === years[years.length - 1] ? "end" : "middle");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Share of this land under water each year since 1984">
      <defs>
        <linearGradient id={`${gid}-w`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-water)" stopOpacity="0.42" />
          <stop offset="1" stopColor="var(--color-water)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {mode === "axis" &&
        [0, 0.2, 0.4].filter((v) => v < max).map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
            <text x={padL - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
      {fill && <rect x={x(fill.from)} y={top - 8} width={x(fill.to) - x(fill.from)} height={bot - top + 8} fill="var(--color-chip)" />}
      <motion.path d={area} fill={`url(#${gid}-w)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
      <motion.path d={line} fill="none" stroke="var(--color-water)" strokeWidth="2.2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: "easeInOut" }} />
      <line x1={padL} x2={W - padR} y1={bot} y2={bot} stroke="var(--color-line-2)" />
      {fi >= 0 && (
        <g>
          <line x1={x(fi)} x2={x(fi)} y1={y(drawn[fi])} y2={bot} stroke="var(--color-flood)" strokeDasharray="2 3" />
          <motion.circle cx={x(fi)} cy={y(drawn[fi])} r="5" fill="var(--color-flood)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1, type: "spring" }} />
        </g>
      )}
      {cur >= 0 && <line x1={x(cur)} x2={x(cur)} y1={top - 8} y2={bot} stroke="var(--color-tx)" strokeWidth="1.2" strokeDasharray="3 3" />}
      {mode === "annotated" && (
        <g fontFamily="var(--font-sans)">
          {wet && (
            <g>
              <text x={x(wet.from) + 4} y={top - 28} fontSize="12.5" fontWeight="700" fill="var(--color-tx)">{wet.title}</text>
              <text x={x(wet.from) + 4} y={top - 13} fontSize="11.5" fill="var(--color-tx-2)">{wet.span}</text>
            </g>
          )}
          {fill && (
            <g>
              <text x={x(fill.from) + 6} y={top - 28} fontSize="12.5" fontWeight="700" fill="var(--color-tx)">{fill.title}</text>
              <text x={x(fill.from) + 6} y={top - 13} fontSize="11.5" fill="var(--color-tx-2)">{fill.span}</text>
            </g>
          )}
          {fi >= 0 && (
            <g>
              <text x={x(fi) - 9} y={y(drawn[fi]) - 22} textAnchor="end" fontSize="12.5" fontWeight="700" fill="var(--color-flood)">Flooded</text>
              <text x={x(fi) - 9} y={y(drawn[fi]) - 8} textAnchor="end" fontSize="11.5" fill="var(--color-tx-2)">{flood}</text>
            </g>
          )}
        </g>
      )}
      {ticks.map((t) => (
        <text key={t} x={x(years.indexOf(t))} y={H - 6} textAnchor={tickAnchor(t)} fontSize="10.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">
          {t}
        </text>
      ))}
    </svg>
  );
}
