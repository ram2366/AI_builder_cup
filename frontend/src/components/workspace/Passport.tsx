import type { LocalityReport, Report } from "../../lib/types";
import { LEVEL_STYLE } from "../../lib/evidence";
import type { WorkspaceTab } from "./WorkspaceTabs";

function landHealthWord(report: Report): string {
  const lh = report.evidence?.land_health;
  if (!lh) return "Not assessed";
  const slope = lh.trends.ndvi?.slope_per_year;
  if (slope === undefined) return "Stable";
  return slope > 0 ? "Improving" : "Declining";
}

/** Plot passport: one chip per area, each opens its tab. */
export function Passport({ report, locality, asOf, onOpen }: { report: Report; locality: LocalityReport | null; asOf: string; onOpen: (t: WorkspaceTab) => void }) {
  const v = report.verdict;
  const ls = v ? LEVEL_STYLE[v.overall] : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Plot passport">
      {ls && (
        <button type="button" className="chip-btn" onClick={() => onOpen("risk")}>
          Land risk
          <b className="inline-flex items-center gap-1.5" style={{ color: ls.color }}>
            <i className="h-1.5 w-1.5 rounded-full" style={{ background: ls.color }} /> {ls.label}
          </b>
        </button>
      )}
      <button type="button" className="chip-btn" onClick={() => onOpen("health")}>
        Land health <b>{landHealthWord(report)}</b>
      </button>
      <button type="button" className="chip-btn" onClick={() => onOpen("neighbourhood")}>
        Neighbourhood <b className="font-mono">{locality ? `${Math.round(locality.overall_score)}/100` : "Check"}</b>
      </button>
      {asOf && <span className="ml-auto font-mono text-[11px] text-tx-3">Data as of {asOf}</span>}
    </div>
  );
}
