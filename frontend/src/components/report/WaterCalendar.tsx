import { useState } from "react";
import { motion } from "motion/react";
import type { Evidence } from "../../lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Every month since 1984 in one picture: columns are years, rows are months, colour is how much of
 * the area was under water. Monsoons read as blue bands; their disappearance and any flood stand out.
 */
export function WaterCalendar({ ev, floodYear }: { ev: Evidence; floodYear: number | null }) {
  const [hover, setHover] = useState<{ y: string; m: number; v: number | null } | null>(null);
  const wm = ev.water_months;
  if (!wm) return null;
  const years = Object.keys(wm.by_year).sort();
  if (years.length < 3) return null;

  const cell = 11;
  const gap = 2;
  const left = 30;
  const topPad = 6;
  const W = left + years.length * (cell + gap);
  const H = topPad + 12 * (cell + gap) + 20;
  const max = Math.max(0.05, ...years.flatMap((y) => wm.by_year[y].map((v) => v ?? 0)));
  const shade = (v: number) => Math.min(1, v / max);

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[520px]" role="img" aria-label="Monthly water on this land from 1984, one square per month">
          {MONTHS.map((m, i) =>
            i % 3 === 0 ? (
              <text key={m} x={left - 6} y={topPad + i * (cell + gap) + cell - 2} textAnchor="end" fontSize="9" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">
                {m}
              </text>
            ) : null,
          )}
          {years.map((yr, xi) => (
            <g key={yr}>
              {wm.by_year[yr].map((v, mi) => {
                const flood = floodYear !== null && Number(yr) === floodYear && v !== null && v >= max * 0.3;
                const cx = left + xi * (cell + gap);
                const cy = topPad + mi * (cell + gap);
                const isHover = hover?.y === yr && hover.m === mi;
                return (
                  <motion.rect
                    key={mi}
                    x={cx}
                    y={cy}
                    width={cell}
                    height={cell}
                    rx="2.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: xi * 0.012 }}
                    fill={v === null ? "var(--color-chip)" : flood ? "var(--color-flood)" : v < 0.005 ? "var(--color-chip)" : "var(--color-water)"}
                    fillOpacity={v === null || v < 0.005 || flood ? 1 : 0.18 + 0.82 * shade(v)}
                    stroke={isHover ? "var(--color-tx)" : v === null ? "var(--color-line-2)" : "none"}
                    strokeWidth={isHover ? 1.5 : 0.6}
                    strokeDasharray={v === null && !isHover ? "1.5 1.5" : undefined}
                    onMouseEnter={() => setHover({ y: yr, m: mi, v })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${MONTHS[mi]} ${yr}: ${v === null ? "no clear image" : `${Math.round(v * 100)}% water`}`}</title>
                  </motion.rect>
                );
              })}
              {(Number(yr) % 10 === 0 || xi === 0 || xi === years.length - 1) && (
                <text x={left + xi * (cell + gap) + cell / 2} y={H - 4} textAnchor="middle" fontSize="9.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">
                  {yr}
                </text>
              )}
            </g>
          ))}
          {/* monsoon band marker */}
          <rect x={left - 26} y={topPad + 5 * (cell + gap) - 1} width="3" height={6 * (cell + gap)} rx="1.5" fill="var(--color-water)" opacity="0.5" />
        </svg>
      </div>
      <figcaption className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-tx-2">
        <span className="flex items-center gap-1.5">
          <span className="flex">
            {[0.25, 0.5, 0.75, 1].map((o) => (
              <span key={o} className="h-2.5 w-2.5 rounded-[2px] bg-water" style={{ opacity: 0.18 + 0.82 * o }} />
            ))}
          </span>
          Less → more water
        </span>
        {floodYear && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-flood" /> Flood
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-line-2 bg-chip" /> No clear image
        </span>
        <span className="ml-auto font-mono text-[11.5px] text-tx">
          {hover ? `${MONTHS[hover.m]} ${hover.y} · ${hover.v === null ? "no clear image" : `${Math.round(hover.v * 100)}% water`}` : "Point at a square for details"}
        </span>
      </figcaption>
    </figure>
  );
}
