import { useState } from "react";
import { motion } from "motion/react";
import { FileUp, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { sectionLabel } from "../lib/evidence";
import type { ClaimCheck, ClaimVerdict } from "../lib/types";
import { Tag } from "./ui";

const VERDICT: Record<ClaimVerdict, { label: string; cls: string }> = {
  contradicted: { label: "Contradicted", cls: "bg-risk-high/15 text-risk-high-tx border-risk-high/30" },
  partly: { label: "Partly true", cls: "bg-risk-moderate/12 text-risk-moderate-tx border-risk-moderate/25" },
  supported: { label: "Supported", cls: "bg-risk-low/12 text-risk-low-tx border-risk-low/25" },
  not_verifiable: { label: "Not verifiable", cls: "bg-chip text-tx-2 border-line" },
};

const MAX_BYTES = 10 * 1024 * 1024;

export function BrochurePanel({ reportId }: { reportId: string }) {
  const [claims, setClaims] = useState<ClaimCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Upload a file under 10 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    setClaims(null);
    try {
      setClaims((await api.brochure(reportId, file)).claims);
    } catch {
      setError("Couldn't check this brochure right now. Try a clear JPG, PNG or PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-tx-2">
        Upload the builder's ad or brochure. Each claim about the land ("flood-free", "lake view", "green") is checked
        against the satellite evidence.
      </p>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition ${
          drag ? "border-ac bg-ac/10" : "border-line-2 bg-chip hover:border-ac/60"
        }`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-ac" /> : <FileUp className="h-5 w-5 text-ac" />}
        <span className="text-[13.5px] font-medium text-tx">{busy ? "Reading the brochure…" : "Drop a file or browse"}</span>
        <span className="text-xs text-tx-3">JPG, PNG, WebP or PDF · up to 10 MB</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      {error && <p className="text-[13px] text-risk-high-tx">{error}</p>}
      {claims && claims.length === 0 && <p className="text-[13px] text-tx-2">No claims about the land's physical setting were found.</p>}
      {claims?.map((c, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="card p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] font-medium text-tx">"{c.text}"</p>
            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${VERDICT[c.verdict].cls}`}>
              {VERDICT[c.verdict].label}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-tx-2">{c.reason}</p>
          {c.evidence_refs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {[...new Set(c.evidence_refs.map((r) => r.split(".")[0]))].map((s) => (
                <Tag key={s} tone="accent">
                  {sectionLabel(s)}
                </Tag>
              ))}
            </div>
          )}
        </motion.div>
      ))}
    </section>
  );
}
