import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { api } from "../../lib/api";
import type { Place } from "../../lib/geocode";
import type { Example } from "../../lib/types";
import { CommandSearch } from "../CommandSearch";

const HERO = "Every place has a history. Now, you can read it.";
const STEPS = [
  { t: "Pick a plot", d: "Search, drop a pin or draw the boundary." },
  { t: "We read 40 years of satellite data", d: "Water, floods, ground height, growth and heat." },
  { t: "Get a cited report", d: "Every claim links to the data behind it." },
];
const ease = [0.16, 1, 0.3, 1] as const;
const ellipse = (rx: number, ry: number) => `M ${-rx} 0 A ${rx} ${ry} 0 1 1 ${rx} 0 A ${rx} ${ry} 0 1 1 ${-rx} 0`;

function OrbitRing({ reduced }: { reduced: boolean }) {
  return (
    <svg className="ho-orbit-ring" viewBox="-500 -500 1000 1000" aria-hidden>
      <defs>
        <linearGradient id="ho-aurora-stroke" x1="0" x2="1">
          <stop offset="0" stopColor="#2DD4BF" stopOpacity=".05" />
          <stop offset=".5" stopColor="#2DD4BF" stopOpacity=".7" />
          <stop offset="1" stopColor="#60A5FA" stopOpacity=".15" />
        </linearGradient>
        <radialGradient id="ho-sat-glow">
          <stop offset="0" stopColor="#E6FFFB" />
          <stop offset=".4" stopColor="#2DD4BF" stopOpacity=".8" />
          <stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="rotate(-16)">
        <path id="ho-orbit" d={ellipse(430, 118)} fill="none" stroke="url(#ho-aurora-stroke)" strokeWidth="1.2" />
        <path d={ellipse(470, 150)} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" strokeDasharray="2 7" />
        <g>
          {!reduced && (
            <animateMotion dur="26s" repeatCount="indefinite" rotate="auto">
              <mpath href="#ho-orbit" />
            </animateMotion>
          )}
          <circle r="14" fill="url(#ho-sat-glow)" transform={reduced ? "translate(-430 0)" : undefined} />
          <circle r="2.6" fill="#E6FFFB" transform={reduced ? "translate(-430 0)" : undefined} />
        </g>
      </g>
    </svg>
  );
}

/** Landing screen: a slowly turning globe, orbit ring and a search that lands from above. */
export function HomeOrbit({ onSearch, onExample }: { onSearch: (p: Place) => void; onExample: (e: Example) => void }) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [examples, setExamples] = useState<Example[]>([]);
  const [examplesError, setExamplesError] = useState(false);
  useEffect(() => {
    api.examples().then((items) => {
      setExamples(items);
      setExamplesError(false);
    }).catch(() => {
      setExamples([]);
      setExamplesError(true);
    });
  }, []);

  return (
    <div className="ho-home on-map">
      <motion.div className="ho-halo" aria-hidden initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 2.2, delay: 0.3, ease }} />
      <motion.div className="ho-orbit-wrap" aria-hidden initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 2.4, delay: 0.7, ease }}>
        <OrbitRing reduced={reduced} />
      </motion.div>

      <div className="ho-hero">
        <motion.p className="ho-kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
          Four decades of satellite evidence, one plot of land
        </motion.p>
        <h1 aria-label={HERO}>
          {HERO.split(" ").map((w, i) => (
            <motion.span key={i} aria-hidden initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08, duration: 0.7, ease }}>
              {w}&nbsp;
            </motion.span>
          ))}
        </h1>
        <div className="ho-search-zone">
          <motion.div className="ho-touchdown" aria-hidden initial={{ opacity: 0, scaleX: 0.3 }} animate={{ opacity: [0, 0.9, 0.35], scaleX: [0.3, 1.1, 1] }} transition={{ delay: 1.1, duration: 1.1, ease }} />
          <motion.div initial={{ y: -200, opacity: 0, scale: 0.94 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 70, damping: 14, mass: 1.1 }}>
            <CommandSearch size="lg" variant="pill" onSelect={onSearch} placeholder="Search an address, layout, survey area or paste coordinates" />
          </motion.div>
        </div>
        <div className="ho-examples" aria-label="Try an example">
          {examples.map((e, i) => (
            <motion.button key={e.id} type="button" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 + i * 0.09, duration: 0.4, ease }} onClick={() => onExample(e)}>
              {e.label} · {e.city}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </motion.button>
          ))}
        </div>
        {examples[0]?.demo_data && <p className="ho-note">Demo mode: reports use illustrative data until Earth Engine is connected.</p>}
        {examplesError && (
          <p role="alert" className="ho-note">
            Example plots aren't available right now. You can still search for any place above.
          </p>
        )}
      </div>

      <ol className="ho-how" aria-label="How it works">
        {STEPS.map((h, i) => (
          <motion.li key={h.t} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 + i * 0.12, duration: 0.45, ease }}>
            <b>0{i + 1}</b>
            <span>{h.t}</span>
            <em>{h.d}</em>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
