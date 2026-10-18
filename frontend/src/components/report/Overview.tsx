import { motion } from "motion/react";
import { LEVEL_STYLE } from "../../lib/evidence";
import type { Level } from "../../lib/types";

export const ADVICE: Record<Level, string> = {
  high: "Think twice before buying. If you still consider it, check the drainage and visit after heavy rain.",
  elevated: "Proceed with care. Verify drainage and visit during the local wet season before you decide.",
  moderate: "Mostly fine, with a few things worth checking on a site visit.",
  low: "No major red flags in 40 years of satellite records. Still do a site visit.",
};

const LEVELS: Level[] = ["low", "moderate", "elevated", "high"];

/** Semicircular dial with four soft segments and an animated needle. */
export function RiskDial({ level, size = 132 }: { level: Level; size?: number }) {
  const idx = LEVELS.indexOf(level);
  const cx = 70;
  const cy = 70;
  const r = 56;
  const seg = (i: number) => {
    const a0 = Math.PI + (i * Math.PI) / 4 + 0.04;
    const a1 = Math.PI + ((i + 1) * Math.PI) / 4 - 0.04;
    return `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
  };
  const angle = -90 + (idx + 0.5) * 45; // degrees from straight up
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 140 86" role="img" aria-label={`${LEVEL_STYLE[level].label} risk`}>
      {LEVELS.map((l, i) => (
        <path
          key={l}
          d={seg(i)}
          fill="none"
          stroke={LEVEL_STYLE[l].color}
          strokeWidth={i === idx ? 12 : 9}
          strokeLinecap="round"
          opacity={i === idx ? 1 : 0.28}
          style={i === idx ? { filter: `drop-shadow(0 0 6px ${LEVEL_STYLE[l].color})` } : undefined}
        />
      ))}
      <motion.g
        initial={{ rotate: -90 }}
        animate={{ rotate: angle }}
        transition={{ type: "spring", stiffness: 70, damping: 12, delay: 0.2 }}
        style={{ originX: `${cx}px`, originY: `${cy}px` }}
      >
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 14} stroke="#e7edf6" strokeWidth="2.5" strokeLinecap="round" />
      </motion.g>
      <circle cx={cx} cy={cy} r="5" fill="#e7edf6" />
      <text x={cx} y={cy + 15} textAnchor="middle" fontFamily="Inter" fontSize="11" fontWeight="700" fill={LEVEL_STYLE[level].color} letterSpacing="1">
        {LEVEL_STYLE[level].label.toUpperCase()}
      </text>
    </svg>
  );
}
