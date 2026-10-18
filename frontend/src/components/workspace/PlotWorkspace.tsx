import type { ReactNode } from "react";
import { Lock, X } from "lucide-react";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";

/** Workspace for a picked plot that has no report yet: same header and tabs, with the plot-size controls in Summary. */
export function PlotWorkspace({
  label,
  lat,
  lng,
  tab,
  onTab,
  onClose,
  summary,
  neighbourhood,
}: {
  label: string | null;
  lat: number;
  lng: number;
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
  onClose: () => void;
  summary: ReactNode;
  neighbourhood: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-ink-850">
      <div className="shrink-0 px-5 pb-3 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="lbl">Selected plot</p>
            {label ? (
              <h2 className="mt-1 font-display text-[19px] font-semibold leading-snug tracking-tight text-tx">{label}</h2>
            ) : (
              <p className="mt-1 text-[15px] font-medium text-tx-2">Finding this address…</p>
            )}
            <p className="mt-1 font-mono text-xs text-tx-2">
              {Math.abs(lat).toFixed(5)}° {lat >= 0 ? "N" : "S"}, {Math.abs(lng).toFixed(5)}° {lng >= 0 ? "E" : "W"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Clear selection" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tx-3 hover:bg-chip hover:text-tx">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <WorkspaceTabs value={tab} onChange={onTab} />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === "summary" && summary}
        {tab === "neighbourhood" && neighbourhood}
        {tab !== "summary" && tab !== "neighbourhood" && (
          <div className="m-5 flex flex-col items-start gap-2 rounded-xl border border-dashed border-line-2 p-5">
            <Lock className="h-5 w-5 text-tx-3" aria-hidden />
            <p className="text-[14px] font-semibold text-tx">Analyse this plot first</p>
            <p className="text-[13px] text-tx-2">Land risk, land health and Ask fill in once the analysis finishes. Open Summary to start it.</p>
            <button onClick={() => onTab("summary")} className="mt-1 text-[13px] font-semibold text-ac hover:text-ac-strong">
              Go to Summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
