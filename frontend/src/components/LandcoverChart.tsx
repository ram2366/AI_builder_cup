import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Evidence } from "../lib/types";

const SERIES = [
  { key: "water", label: "Water", color: "#6aa7f5" },
  { key: "green", label: "Trees, grass, shrub", color: "#7cc79a" },
  { key: "crops", label: "Crops", color: "#e9c46a" },
  { key: "bare", label: "Bare ground", color: "#78716c" },
  { key: "built", label: "Built-up", color: "#f27a8c" },
] as const;

const pct = (x: number) => Math.round(x * 100);

export function LandcoverChart({ evidence, year }: { evidence: Evidence; year?: string | null }) {
  const lc = evidence.landcover;
  if (!lc) return null;
  const data = Object.entries(lc.by_year)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([y, c]) => ({
      year: y,
      water: pct(c.water + c.flooded_vegetation),
      green: pct(c.trees + c.grass + c.shrub_and_scrub),
      crops: pct(c.crops),
      bare: pct(c.bare + c.snow_and_ice),
      built: pct(c.built),
    }));
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-tx">How the land changed</h3>
      <p className="mb-3 mt-0.5 text-xs text-tx-3">Share of land inside the circle · Dynamic World · {lc.resolution_m} m</p>
      <div className="h-56">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#93a1b8" }} axisLine={false} tickLine={false} />
            <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "#5f6c82" }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v, name) => [`${v}%`, name]}
              contentStyle={{ background: "#0d1422", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "#e7edf6" }}
            />
            {SERIES.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId="1" stroke={s.color} strokeWidth={1.2} fill={s.color} fillOpacity={0.35} />
            ))}
            {year && <ReferenceLine x={year} stroke="#e7edf6" strokeDasharray="3 3" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-tx-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
    </section>
  );
}
