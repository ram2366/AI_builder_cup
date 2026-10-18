import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, MapPinned } from "lucide-react";
import { formatValue, resolveRef, sectionLabel } from "../lib/evidence";
import type { Dimension, Evidence, Finding } from "../lib/types";
import { Tag } from "./ui";

const SEVERITY_DOT = { concern: "bg-risk-high", watch: "bg-risk-moderate", info: "bg-tx-3" } as const;
const CONF_TONE = { high: "good", medium: "warn", low: "neutral" } as const;

export function FindingsList({
  findings,
  evidence,
  onShowOnMap,
}: {
  findings: Finding[];
  evidence: Evidence;
  onShowOnMap?: (d: Dimension) => void;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {findings.map((f, i) => (
        <motion.li
          key={f.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
        >
          <FindingRow f={f} evidence={evidence} onShowOnMap={onShowOnMap} />
        </motion.li>
      ))}
    </ul>
  );
}

function FindingRow({ f, evidence, onShowOnMap }: { f: Finding; evidence: Evidence; onShowOnMap?: (d: Dimension) => void }) {
  const [open, setOpen] = useState(false);
  const sections = [...new Set(f.evidence_refs.map((r) => r.split(".")[0]))];
  return (
    <div className="card p-3.5 transition-colors hover:border-line-2">
      <div className="flex gap-3">
        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-relaxed text-tx">{f.claim}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {sections.map((s) => (
              <Tag key={s} tone="accent">
                {sectionLabel(s)}
              </Tag>
            ))}
            <Tag tone={CONF_TONE[f.confidence]}>{f.confidence} confidence</Tag>
            <span className="ml-auto flex items-center gap-1">
              {onShowOnMap && (
                <button
                  onClick={() => onShowOnMap(f.dimension)}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-tx-2 hover:bg-chip hover:text-tx"
                >
                  <MapPinned className="h-3.5 w-3.5" /> Map
                </button>
              )}
              <button
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-tx-2 hover:bg-chip hover:text-tx"
              >
                Data <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            </span>
          </div>
          {open && (
            <motion.dl
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2.5 overflow-hidden rounded-lg bg-ink-900/70 p-2.5 font-mono text-[11px]"
            >
              {f.evidence_refs.map((r) => (
                <div key={r} className="flex gap-2 py-0.5">
                  <dt className="text-tx-3">{r}</dt>
                  <dd className="break-all text-ac">= {formatValue(resolveRef(evidence, r))}</dd>
                </div>
              ))}
            </motion.dl>
          )}
        </div>
      </div>
    </div>
  );
}
