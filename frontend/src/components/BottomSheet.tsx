import { useEffect, useState, type ReactNode } from "react";
import { animate, motion, useDragControls, useMotionValue } from "motion/react";

/** Mobile bottom sheet with three snap points (peek, half, full), dragged by its handle. */
export function BottomSheet({ children, initial = "half" }: { children: ReactNode; initial?: "peek" | "half" | "full" }) {
  const [vh, setVh] = useState(window.innerHeight);
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const snaps = { full: vh * 0.08, half: vh * 0.45, peek: vh * 0.78 };
  const y = useMotionValue(snaps[initial]);
  const controls = useDragControls();

  useEffect(() => {
    animate(y, snaps[initial], { type: "spring", stiffness: 300, damping: 34 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, vh]);

  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-30 flex flex-col rounded-t-[24px] border-t border-line bg-ink-850 shadow-[0_-12px_40px_rgba(0,0,0,0.5)]"
      style={{ y, height: vh }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: snaps.full, bottom: snaps.peek }}
      dragElastic={0.08}
      onDragEnd={(_, info) => {
        const projected = y.get() + info.velocity.y * 0.2;
        const target = Object.values(snaps).reduce((a, b) => (Math.abs(b - projected) < Math.abs(a - projected) ? b : a));
        animate(y, target, { type: "spring", stiffness: 320, damping: 34 });
      }}
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
        aria-label="Drag to resize"
      >
        <span className="h-1 w-10 rounded-full bg-line-2" />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: vh * 0.1 }}>
        {children}
      </div>
    </motion.div>
  );
}
