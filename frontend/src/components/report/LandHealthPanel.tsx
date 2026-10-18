import type { LandHealthEvidence, LandHealthYear, TrendResult } from "../../lib/types";

type IndexKey = "mndwi_median" | "ndbi_median" | "ndmi_median" | "lst_may_c";

const METRICS: { key: IndexKey; trend: "mndwi" | "ndbi" | "ndmi" | "lst"; label: string; meaning: string; color: string; digits: number; unit: string }[] = [
  { key: "mndwi_median", trend: "mndwi", label: "MNDWI", meaning: "Open water / wetness", color: "var(--color-water)", digits: 2, unit: "" },
  { key: "ndbi_median", trend: "ndbi", label: "NDBI", meaning: "Built-up intensity", color: "var(--color-built)", digits: 2, unit: "" },
  { key: "ndmi_median", trend: "ndmi", label: "NDMI", meaning: "Vegetation moisture", color: "var(--color-ac)", digits: 2, unit: "" },
  { key: "lst_may_c", trend: "lst", label: "May LST", meaning: "Land-surface heat", color: "var(--color-signal)", digits: 1, unit: " °C" },
];

function trendText(trend: TrendResult | undefined, unit = ""): string {
  if (!trend || !trend.significant) return "No significant trend";
  const sign = trend.slope_per_year > 0 ? "+" : "";
  return `${sign}${trend.slope_per_year.toFixed(unit ? 2 : 3)}${unit}/yr · p ${trend.p_value.toFixed(3)}`;
}

function series(health: LandHealthEvidence, key: keyof LandHealthYear) {
  return Object.keys(health.by_year)
    .sort()
    .flatMap((year) => {
      const value = health.by_year[year][key];
      return typeof value === "number" ? [{ year, value }] : [];
    });
}

function linePath(values: number[], width: number, height: number, pad = 4) {
  if (values.length < 2) return "";
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  return values
    .map((value, i) => `${i ? "L" : "M"}${pad + (i / (values.length - 1)) * (width - 2 * pad)},${height - pad - ((value - low) / span) * (height - 2 * pad)}`)
    .join(" ");
}

function MetricCard({ health, metric }: { health: LandHealthEvidence; metric: (typeof METRICS)[number] }) {
  const points = series(health, metric.key);
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <article className="rounded-xl border border-line bg-chip/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-tx">{metric.label}</p>
          <p className="mt-0.5 text-[11.5px] text-tx-3">{metric.meaning}</p>
        </div>
        <p className="font-mono text-[13px] font-semibold tabular-nums text-tx">
          {last.value.toFixed(metric.digits)}{metric.unit}
        </p>
      </div>
      <svg viewBox="0 0 180 38" className="mt-3 h-[38px] w-full" role="img" aria-label={`${metric.label} from ${first.year} to ${last.year}`}>
        <line x1="4" x2="176" y1="34" y2="34" stroke="var(--color-line)" />
        <path d={linePath(points.map((point) => point.value), 180, 38)} fill="none" stroke={metric.color} strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-tx-3">
        <span>{first.year} · {first.value.toFixed(metric.digits)}</span>
        <span>{last.year}</span>
      </div>
      <p className={`mt-2 text-[11.5px] ${health.trends[metric.trend]?.significant ? "font-semibold text-tx" : "text-tx-3"}`}>
        {trendText(health.trends[metric.trend], metric.unit.trim())}
      </p>
    </article>
  );
}

function NdviHistory({ health }: { health: LandHealthEvidence }) {
  const rows = Object.keys(health.by_year)
    .sort()
    .map((year) => ({ year, ...health.by_year[year] }))
    .filter((row) => row.ndvi_median !== null && row.ndvi_p10 !== null && row.ndvi_p90 !== null);
  if (rows.length < 2) return null;
  const W = 600;
  const H = 150;
  const pad = { l: 38, r: 8, t: 12, b: 25 };
  const values = rows.flatMap((row) => [row.ndvi_p10!, row.ndvi_p90!]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const margin = Math.max(0.04, (high - low) * 0.12);
  const y0 = low - margin;
  const y1 = high + margin;
  const x = (i: number) => pad.l + (i / (rows.length - 1)) * (W - pad.l - pad.r);
  const y = (value: number) => pad.t + ((y1 - value) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const median = rows.map((row, i) => `${i ? "L" : "M"}${x(i)},${y(row.ndvi_median!)}`).join(" ");
  const upper = rows.map((row, i) => `${x(i)},${y(row.ndvi_p90!)}`);
  const lower = [...rows].reverse().map((row, reverseIndex) => {
    const i = rows.length - 1 - reverseIndex;
    return `${x(i)},${y(row.ndvi_p10!)}`;
  });
  const band = `${upper.join(" ")} ${lower.join(" ")}`;
  return (
    <figure className="rounded-xl border border-line bg-chip/30 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-tx">NDVI · vegetation health</p>
          <p className="mt-0.5 text-[11.5px] text-tx-3">Yearly median; shaded band is the seasonal 10th–90th percentile</p>
        </div>
        <p className={`text-[11.5px] ${health.trends.ndvi?.significant ? "font-semibold text-tx" : "text-tx-3"}`}>
          {trendText(health.trends.ndvi)}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full" role="img" aria-label={`NDVI history from ${rows[0].year} to ${rows[rows.length - 1].year}`}>
        {[y0, (y0 + y1) / 2, y1].map((value) => (
          <g key={value}>
            <line x1={pad.l} x2={W - pad.r} y1={y(value)} y2={y(value)} stroke="var(--color-line)" />
            <text x={pad.l - 6} y={y(value) + 3} textAnchor="end" fontSize="10" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">{value.toFixed(2)}</text>
          </g>
        ))}
        <polygon points={band} fill="var(--color-risk-low)" fillOpacity="0.14" />
        <path d={median} fill="none" stroke="var(--color-risk-low)" strokeWidth="2.2" />
        {rows.map((row, i) => <circle key={row.year} cx={x(i)} cy={y(row.ndvi_median!)} r="2.6" fill="var(--color-risk-low)" />)}
        <text x={pad.l} y={H - 5} fontSize="10.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">{rows[0].year}</text>
        <text x={W - pad.r} y={H - 5} textAnchor="end" fontSize="10.5" fill="var(--color-tx-3)" fontFamily="var(--font-mono)">{rows[rows.length - 1].year}</text>
      </svg>
    </figure>
  );
}

export function LandHealthPanel({ health }: { health: LandHealthEvidence }) {
  const months = Object.values(health.monthly_ndvi_climatology);
  const amplitude = months.length >= 2 ? Math.max(...months) - Math.min(...months) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 text-[11.5px] text-tx-2">
        {health.context.ndvi_percentile !== null && (
          <span className="rounded-full border border-line px-2.5 py-1">Greener than {Math.round(health.context.ndvi_percentile)}% of land within {health.context.compare_radius_km} km</span>
        )}
        {health.context.lst_may_delta_c !== null && (
          <span className="rounded-full border border-line px-2.5 py-1">May surface: {health.context.lst_may_delta_c > 0 ? "+" : ""}{health.context.lst_may_delta_c.toFixed(1)} °C vs surroundings</span>
        )}
        {amplitude !== null && <span className="rounded-full border border-line px-2.5 py-1">NDVI seasonal range {amplitude.toFixed(2)}</span>}
      </div>
      <NdviHistory health={health} />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {METRICS.map((metric) => <MetricCard key={metric.key} health={health} metric={metric} />)}
      </div>
      <p className="font-mono text-[10.5px] leading-relaxed text-tx-3">
        Sentinel-2 indices: 10 m, Cloud Score+ clear pixels only · Landsat surface temperature: 30 m · A trend label requires p &lt; 0.05 and at least 6 years.
      </p>
    </div>
  );
}
