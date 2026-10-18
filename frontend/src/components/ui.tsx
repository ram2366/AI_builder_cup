import { useEffect, useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { LEVEL_STYLE } from "../lib/evidence";
import type { Level } from "../lib/types";

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M25.5 7.2a12.2 12.2 0 1 0-.2 17.8l-3.4-3.4" fill="none" stroke="#46e2cf" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M22.5 10.2a8.1 8.1 0 1 0-.2 11.7" fill="none" stroke="#2bb8aa" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M19.5 13.2a4 4 0 1 0-.1 5.7" fill="none" stroke="#277f79" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M17.1 18.1h8.2v7.1" fill="none" stroke="#55ead6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25.3" cy="25.2" r="2.5" fill="#7af4e2" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="font-display flex items-center gap-3 text-[22px] font-bold tracking-[-0.035em] text-tx sm:text-[24px]">
      <Logo size={34} /> GeoMind
    </span>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "md",
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] border border-line bg-chip p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`relative rounded-[7px] ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]"} transition-colors ${on ? "text-tx" : "text-tx-2 hover:text-tx"}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[7px] bg-ink-700 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void }) {
  const id = useId();
  return (
    <div role="tablist" className="scroll-thin flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`relative flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-2 text-[13px] transition-colors ${on ? "text-tx" : "text-tx-2 hover:text-tx"}`}
          >
            {t.icon}
            {t.label}
            {on && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-ac" />}
          </button>
        );
      })}
    </div>
  );
}

const GAUGE_FRACTION: Record<Level, number> = { low: 0.22, moderate: 0.48, elevated: 0.7, high: 0.88 };

export function RiskGauge({ level, size = 88 }: { level: Level; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const s = LEVEL_STYLE[level];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${s.label} risk`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <motion.circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth="10"
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - GAUGE_FRACTION[level]) }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      <text x="50" y="49" textAnchor="middle" fill={s.color} fontSize="14" fontWeight="700" fontFamily="Inter">
        {s.label.toUpperCase()}
      </text>
      <text x="50" y="64" textAnchor="middle" fill="#93a1b8" fontSize="10" fontFamily="Inter">
        risk
      </text>
    </svg>
  );
}

export function useIsDesktop(): boolean {
  const query = "(min-width: 1024px)";
  const [is, setIs] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setIs(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return is;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warn" | "bad" }) {
  const cls = {
    neutral: "bg-chip text-tx-2",
    accent: "bg-ac/12 text-ac",
    good: "bg-risk-low/10 text-risk-low-tx",
    warn: "bg-risk-elevated/12 text-risk-elevated-tx",
    bad: "bg-risk-high/12 text-risk-high-tx",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}
