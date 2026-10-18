import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

function useClickAway(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Popover({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.14 }}
          className="panel absolute right-0 top-full z-40 mt-2 min-w-[210px] origin-top-right rounded-xl p-1.5"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface MenuAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function MoreMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="grid h-8 w-8 place-items-center rounded-lg border border-line text-tx hover:bg-chip"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Popover open={open}>
        {actions.map((a) => (
          <button
            key={a.label}
            role="menuitem"
            disabled={a.disabled}
            onClick={() => {
              a.onClick();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-tx hover:bg-chip disabled:opacity-40"
          >
            <span className={a.active ? "text-ac" : "text-tx-2"}>{a.icon}</span>
            <span className="flex-1">{a.label}</span>
            {a.hint && <span className="text-[11px] text-tx-3">{a.hint}</span>}
          </button>
        ))}
      </Popover>
    </div>
  );
}
