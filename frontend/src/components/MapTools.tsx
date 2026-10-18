import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Info, Pause, Play } from "lucide-react";
import { LAYERS, availableLayers, floodYear, layerEvidenceDetails, timelineYears, waterShare, type LayerId } from "../lib/layers";
import type { Evidence } from "../lib/types";

function ramp(colors: string[]): string {
  return colors.length === 1 ? colors[0] : `linear-gradient(90deg, ${colors.join(", ")})`;
}

export function LayersPanel({
  evidence,
  visible,
  onToggle,
  illustrative,
}: {
  evidence: Evidence;
  visible: Record<LayerId, boolean>;
  onToggle: (id: LayerId) => void;
  illustrative: boolean;
}) {
  const have = new Set(availableLayers(evidence));
  const [info, setInfo] = useState<LayerId | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!info) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setInfo(null);
    const onDown = (event: MouseEvent) => !panel.current?.contains(event.target as Node) && setInfo(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [info]);

  return (
    <div ref={panel} className="panel w-[300px] rounded-2xl p-3.5">
      <p className="lbl mb-2.5">Map layers</p>
      <div className="flex flex-col gap-1">
        {LAYERS.map((l) => {
          const on = visible[l.id] && have.has(l.id);
          const disabled = !have.has(l.id);
          const details = layerEvidenceDetails(l.id, evidence);
          const cardId = `layer-info-${l.id}`;
          return (
            <div key={l.id} className="relative">
              <div className={`flex items-center rounded-lg transition ${disabled ? "text-tx-3" : "text-tx hover:bg-chip"}`}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => onToggle(l.id)}
                  title={disabled ? "No signal for this layer here" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1.5 text-left text-[13px] disabled:cursor-default"
                >
                  <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-ac" : "bg-line-2"}`}>
                    <motion.span
                      layout
                      transition={{ type: "spring", stiffness: 600, damping: 35 }}
                      className={`absolute top-0.5 h-3 w-3 rounded-full ${on ? "right-0.5 bg-white" : "left-0.5 bg-tx-3"}`}
                    />
                  </span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color, opacity: disabled ? 0.35 : 1 }} />
                  <span className={`min-w-0 truncate ${disabled ? "line-through decoration-tx-3/50" : ""}`}>{l.label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`About ${l.label}`}
                  aria-expanded={info === l.id}
                  aria-controls={cardId}
                  onClick={() => setInfo((current) => (current === l.id ? null : l.id))}
                  className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-tx-3 hover:bg-ink-700 hover:text-tx focus-visible:outline focus-visible:outline-2 focus-visible:outline-ac"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              {info === l.id && (
                <div id={cardId} data-layer-info-card role="dialog" aria-label={`${l.label} explanation`} className="relative z-10 mx-1 mb-2 mt-1 rounded-xl border border-line-2 bg-ink-800 p-3 shadow-xl">
                  <p className="text-[12.5px] leading-relaxed text-tx">{l.shows}</p>
                  <div className="mt-2.5">
                    <div className="h-2.5 rounded-full border border-white/10" style={{ background: ramp(l.ramp) }} aria-hidden />
                    <div className="mt-1 flex justify-between gap-3 text-[10.5px] text-tx-3">
                      <span>{l.minLabel}</span><span className="text-right">{l.maxLabel}</span>
                    </div>
                  </div>
                  <dl className="mt-2.5 grid grid-cols-[62px_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
                    <dt className="text-tx-3">Source</dt><dd className="min-w-0 break-words text-tx-2">{details.source}</dd>
                    <dt className="text-tx-3">Resolution</dt><dd className="min-w-0 break-words text-tx-2">{details.resolution}</dd>
                    <dt className="text-tx-3">Period</dt><dd className="min-w-0 break-words text-tx-2">{details.period}</dd>
                  </dl>
                  <p className="mt-2.5 border-t border-line pt-2 text-[11px] leading-snug text-warn"><strong>Watch out:</strong> {l.watchOut}</p>
                  {details.unavailableReason && <p className="mt-2 rounded-lg bg-chip px-2.5 py-2 text-[11px] leading-snug text-tx-2"><strong className="text-tx">Why disabled:</strong> {details.unavailableReason}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {illustrative && <p className="mt-2 text-[11px] leading-snug text-warn">Shapes are illustrative in demo mode.</p>}
    </div>
  );
}

export function ActiveLayerLegends({ ids }: { ids: LayerId[] }) {
  if (!ids.length) return null;
  return (
    <div className="flex max-w-[270px] flex-col gap-1.5" aria-label="Active map layer legends">
      {ids.slice(0, 3).map((id) => {
        const layer = LAYERS.find((item) => item.id === id);
        if (!layer) return null;
        return (
          <div key={id} className="panel rounded-lg px-2.5 py-2 shadow-lg">
            <p className="mb-1 truncate text-[10.5px] font-semibold text-tx">{layer.label}</p>
            <div className="h-1.5 w-36 rounded-full border border-white/10" style={{ background: ramp(layer.ramp) }} aria-hidden />
            <div className="mt-0.5 flex w-36 justify-between gap-2 text-[9.5px] leading-tight text-tx-3">
              <span>{layer.minLabel}</span><span className="text-right">{layer.maxLabel}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TimelineScrubber({
  evidence,
  year,
  onYear,
  playing,
  onPlaying,
}: {
  evidence: Evidence;
  year: string | null;
  onYear: (y: string) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
}) {
  const years = timelineYears(evidence);
  const max = Math.max(0.01, ...years.map((y) => waterShare(evidence, y)));
  const fy = floodYear(evidence);
  const wet = new Set(evidence.monsoon?.seen ?? []);
  const current = year ?? years[years.length - 1];

  useEffect(() => {
    if (!playing || !years.length) return;
    const t = setInterval(() => {
      const i = years.indexOf(current);
      if (i >= years.length - 1) onPlaying(false);
      else onYear(years[i + 1]);
    }, years.length > 20 ? 260 : 750);
    return () => clearInterval(t);
  }, [playing, current, years, onYear, onPlaying]);

  if (years.length < 2) return null;
  const isFlood = fy !== null && Number(current) === fy;
  const share = Math.round(waterShare(evidence, current) * 100);

  return (
    <div className="panel flex items-center gap-4 rounded-2xl px-4 py-3">
      <button
        onClick={() => {
          if (!playing && current === years[years.length - 1]) onYear(years[0]);
          onPlaying(!playing);
        }}
        aria-label={playing ? "Pause timeline" : "Play timeline"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ac text-ac-ink transition hover:bg-ac-strong"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`flex h-9 items-end ${years.length > 20 ? "gap-px" : "gap-[3px]"}`}>
          {years.map((y) => {
            const h = 15 + 85 * (waterShare(evidence, y) / max);
            const flood = fy !== null && Number(y) === fy;
            const on = y === current;
            return (
              <button
                key={y}
                onClick={() => {
                  onPlaying(false);
                  onYear(y);
                }}
                aria-label={`Show ${y}`}
                className="group relative flex h-full flex-1 items-end"
              >
                <span
                  className={`w-full rounded-[3px] transition-all ${flood ? "bg-flood" : "bg-water"} ${on ? "opacity-100" : "opacity-45 group-hover:opacity-75"}`}
                  style={{ height: `${h}%` }}
                />
                {wet.has(Number(y)) && <span className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-water" />}
                {on && <motion.span layoutId="tl-cursor" className="absolute -bottom-1.5 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-white" />}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex font-mono text-[10.5px] text-tx-3">
          {years.map((y) => {
            const show = years.length <= 12 || Number(y) % 5 === 0 || y === years[years.length - 1];
            return (
              <span key={y} className={`flex-1 text-center ${y === current ? "text-tx" : ""}`}>
                {show ? (years.length > 12 ? y : y.slice(2)) : ""}
              </span>
            );
          })}
        </div>
      </div>
      <div className="w-[118px] shrink-0 text-right">
        <p className="font-mono text-lg font-medium text-tx">{current}</p>
        <p className={`text-[11px] ${isFlood ? "text-flood" : "text-tx-2"}`}>
          {isFlood ? `Flood event · ${Math.round((evidence.s1?.flooded_fraction_aoi ?? 0) * 100)}% area` : `Water ${share}% of area`}
          <span className="block text-tx-3">{Number(current) <= 2021 && evidence.water_years ? "JRC · 30 m" : "Dynamic World · 10 m"}</span>
        </p>
      </div>
    </div>
  );
}
