import { Bookmark, RotateCw, X } from "lucide-react";
import { LEVEL_STYLE } from "../lib/evidence";
import { useSaved, type SavedPlot } from "../lib/saved";

/** Saved plots on the home screen: open the report, or re-check it with today's data. */
export function SavedPlots({ onOpen, onRecheck }: { onOpen: (p: SavedPlot) => void; onRecheck: (p: SavedPlot) => void }) {
  const { saved, remove } = useSaved();
  if (!saved.length) return null;
  return (
    <div className="mt-6">
      <p className="lbl mb-2 flex items-center gap-1.5">
        <Bookmark className="h-3.5 w-3.5" /> Your saved plots
      </p>
      <ul className="flex flex-col gap-1.5">
        {saved.slice(0, 4).map((p) => (
          <li key={p.reportId} className="group flex items-center gap-2 rounded-xl border border-line bg-chip px-3 py-2">
            {p.overall && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_STYLE[p.overall].color }} />}
            <button onClick={() => onOpen(p)} className="min-w-0 flex-1 truncate text-left text-[13px] text-tx hover:text-ac-strong">
              {p.label}
            </button>
            <span className="hidden font-mono text-[10.5px] text-tx-3 sm:inline">{new Date(p.savedAt).toLocaleDateString()}</span>
            <button onClick={() => onRecheck(p)} title="Re-check with the latest data" aria-label={`Re-check ${p.label}`} className="rounded p-1 text-tx-3 hover:text-ac">
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => remove(p.reportId)} aria-label={`Remove ${p.label}`} className="rounded p-1 text-tx-3 opacity-0 hover:text-tx group-hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
