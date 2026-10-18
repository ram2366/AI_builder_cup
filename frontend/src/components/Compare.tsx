import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Columns3, Crown, Loader2, Sparkles, X } from "lucide-react";
import { api } from "../lib/api";
import { DIMENSION_LONG, DIMENSION_ORDER, LEVEL_STYLE } from "../lib/evidence";
import { useCompare } from "../lib/saved";
import type { CompareResponse, Report } from "../lib/types";
import { RiskDial } from "./report/Overview";

export function CompareTray({ onOpen }: { onOpen: () => void }) {
  const { items, toggle, clear } = useCompare();
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="panel flex items-center gap-2 rounded-2xl p-2 pl-3"
        >
          <Columns3 className="h-4 w-4 shrink-0 text-ac" />
          <div className="flex max-w-[52vw] gap-1.5 overflow-x-auto">
            {items.map((i) => (
              <span key={i.reportId} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-chip py-1 pl-2.5 pr-1 text-[12.5px] text-tx">
                {i.overall && <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_STYLE[i.overall].color }} />}
                <span className="max-w-[150px] truncate">{i.label}</span>
                <button onClick={() => toggle(i)} aria-label={`Remove ${i.label}`} className="rounded p-0.5 text-tx-3 hover:text-tx">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <button
            onClick={onOpen}
            disabled={items.length < 2}
            className="shrink-0 rounded-xl bg-ac px-3 py-1.5 text-[13px] font-semibold text-ac-ink transition hover:bg-ac-strong disabled:bg-line-2 disabled:text-tx-3"
            title={items.length < 2 ? "Add at least two plots" : undefined}
          >
            Compare {items.length}/3
          </button>
          <button onClick={clear} className="shrink-0 px-1.5 text-[12px] text-tx-3 hover:text-tx">
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function CompareView({ onClose, onOpenReport }: { onClose: () => void; onOpenReport: (id: string) => void }) {
  const { items } = useCompare();
  const [reports, setReports] = useState<(Report | null)[]>([]);
  const [summary, setSummary] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      const rs = await Promise.all(items.map((i) => api.getReport(i.reportId).catch(() => null)));
      if (stop) return;
      setReports(rs);
      const ok = rs.filter((r): r is Report => !!r);
      if (ok.length < 2) {
        setError("Some reports have expired. Re-run them, then compare again.");
        return;
      }
      api.compare(ok.map((r) => r.id)).then((s) => !stop && setSummary(s)).catch(() => setError("Couldn't compare right now."));
    })();
    return () => {
      stop = true;
    };
  }, [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ok = reports.filter((r): r is Report => !!r);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <motion.div
        initial={{ y: 24, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Compare plots"
        className="scroll-thin max-h-full w-full max-w-5xl overflow-y-auto rounded-3xl border border-line bg-ink-850 p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-tx">
            <Columns3 className="h-5 w-5 text-ac" /> Compare plots
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-tx-2 hover:bg-chip hover:text-tx">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-ac/25 bg-ac/[0.06] p-4">
          {summary ? (
            <p className="flex gap-2 text-[14.5px] leading-relaxed text-tx">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-ac" />
              {summary.summary}
            </p>
          ) : error ? (
            <p className="text-sm text-risk-high-tx">{error}</p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-tx-2">
              <Loader2 className="h-4 w-4 animate-spin text-ac" /> Comparing the evidence…
            </p>
          )}
        </div>

        {ok.length > 0 && (
          <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: `repeat(${ok.length}, minmax(0, 1fr))` }}>
            {ok.map((r) => {
              const best = summary?.best_id === r.id;
              return (
                <div key={r.id} className={`flex flex-col rounded-2xl border p-4 ${best ? "border-ac/50 bg-ac/[0.05]" : "border-line bg-chip"}`}>
                  <div className="flex h-5 items-center">
                    {best && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-ac">
                        <Crown className="h-3.5 w-3.5" /> Lowest risk
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 min-h-[40px] text-[14.5px] font-semibold text-tx">{r.location.label ?? "Plot"}</p>
                  <div className="mt-2 flex justify-center">{r.verdict && <RiskDial level={r.verdict.overall} size={140} />}</div>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {DIMENSION_ORDER.map((d) => {
                      const x = r.ratings[d];
                      return (
                        <div key={d} className="flex items-center justify-between gap-2 border-b border-line pb-1.5 text-[12.5px]">
                          <span className="truncate text-tx-2">{DIMENSION_LONG[d]}</span>
                          <span className={x ? LEVEL_STYLE[x.level].text : "text-tx-3"}>{x ? LEVEL_STYLE[x.level].label : "n/a"}</span>
                        </div>
                      );
                    })}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11.5px]">
                    <Stat k="Water since 1984" v={r.evidence?.jrc ? `${r.evidence.jrc.occurrence_core_pct}%` : "n/a"} />
                    <Stat k="Wet seasons" v={r.evidence?.monsoon ? `${r.evidence.monsoon.seen.length}/${r.evidence.monsoon.observed_years}` : "n/a"} />
                    <Stat k="Vs 500 m median" v={r.evidence?.terrain ? `${r.evidence.terrain.relative_height_500m_m > 0 ? "+" : ""}${r.evidence.terrain.relative_height_500m_m} m` : "n/a"} />
                    <Stat k="Radar flood" v={r.evidence?.s1 ? `${Math.round(r.evidence.s1.flooded_fraction_aoi * 100)}%` : "none"} />
                  </dl>
                  <button onClick={() => onOpenReport(r.id)} className="mt-4 rounded-xl border border-line py-2 text-[13px] text-tx hover:bg-chip">
                    Open report
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-chip px-2 py-1.5">
      <dt className="font-sans text-[10.5px] text-tx-3">{k}</dt>
      <dd className="text-tx">{v}</dd>
    </div>
  );
}
