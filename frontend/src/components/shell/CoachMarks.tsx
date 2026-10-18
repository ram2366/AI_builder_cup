import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

const KEY = "sampaaa.coach.done";
const TIPS = [
  { t: "Search from anywhere", d: "Press ⌘K (or /) to jump to any address, layout or coordinates." },
  { t: "One workspace per plot", d: "Summary, Land risk, Land health, Neighbourhood and Ask are tabs on the left." },
  { t: "Put the evidence on the map", d: "Use Layers in the toolbar on the right edge to see water, floods and ground height." },
];

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Three dismissible first-run tips. Remembered in localStorage. */
export function CoachMarks({ left }: { left: number }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(() => !seen());
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* storage unavailable */
    }
  };
  const tip = TIPS[i];
  return (
    <AnimatePresence>
      {open && (
        <motion.aside key={i} role="status" aria-label="Tip" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="panel on-map coach" style={{ left }}>
          <button type="button" onClick={close} aria-label="Dismiss tips" className="coach-x"><X className="h-3.5 w-3.5" /></button>
          <p className="lbl !text-ac">Tip {i + 1} of {TIPS.length}</p>
          <p className="mt-1 text-[13.5px] font-semibold text-tx">{tip.t}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tx-2">{tip.d}</p>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={() => (i < TIPS.length - 1 ? setI(i + 1) : close())} className="rounded-lg bg-ac px-3 py-1.5 text-[12.5px] font-semibold text-ac-ink">{i < TIPS.length - 1 ? "Next" : "Got it"}</button>
            <button type="button" onClick={close} className="text-[12.5px] text-tx-3 hover:text-tx">Skip</button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
