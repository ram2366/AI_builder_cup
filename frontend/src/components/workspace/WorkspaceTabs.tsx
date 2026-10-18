import { useId } from "react";
import { motion } from "motion/react";

export type WorkspaceTab = "summary" | "risk" | "health" | "neighbourhood" | "ask";
export const WORKSPACE_TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "risk", label: "Land risk" },
  { id: "health", label: "Land health" },
  { id: "neighbourhood", label: "Neighbourhood" },
  { id: "ask", label: "Ask" },
];

/** The plot workspace tab strip. Arrow keys move between tabs. */
export function WorkspaceTabs({ value, onChange }: { value: WorkspaceTab; onChange: (t: WorkspaceTab) => void }) {
  const id = useId();
  const move = (dir: number) => {
    const i = WORKSPACE_TABS.findIndex((t) => t.id === value);
    const next = WORKSPACE_TABS[(i + dir + WORKSPACE_TABS.length) % WORKSPACE_TABS.length];
    onChange(next.id);
    requestAnimationFrame(() => document.getElementById(`ws-tab-${next.id}`)?.focus());
  };
  return (
    <div
      role="tablist"
      aria-label="Plot workspace"
      className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
      }}
    >
      {WORKSPACE_TABS.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            id={`ws-tab-${t.id}`}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`relative shrink-0 px-3 pb-3 pt-3 text-[13.5px] font-semibold transition-colors ${on ? "text-tx" : "text-tx-3 hover:text-tx"}`}
          >
            {t.label}
            {on && <motion.span layoutId={`ws-tab-${id}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ac" transition={{ duration: 0.18 }} />}
          </button>
        );
      })}
    </div>
  );
}
