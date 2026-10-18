import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { Report } from "../lib/types";
import { FINAL_STATUSES } from "../lib/types";

const PENDING = ["Gemini investigation", "Verify every claim"];

/** Live step list. Agent steps get highlighted so users see the AI reasoning, not just a spinner. */
export function ProgressTimeline({ report, compact = false }: { report: Report; compact?: boolean }) {
  const running = !FINAL_STATUSES.includes(report.status);
  const t0 = report.progress[0]?.ts ?? report.created_at;
  const steps = report.progress.filter((p) => p.step !== "done");
  const agentSeen = steps.some((p) => p.step === "agent" || p.step === "drilldown");
  const verifySeen = steps.some((p) => p.step === "verify");
  const upcoming = running ? PENDING.filter((_, i) => (i === 0 ? !agentSeen : !verifySeen)) : [];

  return (
    <ol className={`flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}>
      <AnimatePresence initial={false}>
        {steps.map((p, i) => {
          const isAgent = p.msg.startsWith("Agent:") || p.step === "agent";
          const last = running && i === steps.length - 1;
          return (
            <motion.li
              key={`${p.ts}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex items-start gap-2.5 text-[13.5px] ${
                isAgent && last ? "rounded-xl border border-ac/25 bg-ac/[0.07] p-2.5" : ""
              }`}
            >
              {p.step === "error" ? (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-risk-high" />
              ) : last ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ac" />
              ) : isAgent ? (
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ac" />
              ) : (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ac" />
              )}
              <span className={`flex-1 ${isAgent ? "text-tx" : "text-tx-2"}`}>{p.msg.replace(/^Agent:\s*/, "")}</span>
              <span className="font-mono text-[11px] text-tx-3">{(p.ts - t0).toFixed(1)}s</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
      {upcoming.map((u) => (
        <li key={u} className="flex items-center gap-2.5 text-[13.5px] text-tx-3">
          <span className="ml-1 mr-0.5 h-2 w-2 rounded-full border border-tx-3" /> {u}
        </li>
      ))}
    </ol>
  );
}
