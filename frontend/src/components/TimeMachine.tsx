import { useState } from "react";
import { Eye, ImageOff } from "lucide-react";
import type { Evidence } from "../lib/types";

/** Before/after slider over Sentinel-2 images, plus Gemini's reading of what changed. */
export function TimeMachine({ evidence }: { evidence: Evidence }) {
  const images = [...evidence.images].sort((a, b) => a.year - b.year);
  const [split, setSplit] = useState(50);
  const before = images[0];
  const after = images[images.length - 1];

  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-tx">Satellite time machine</h3>
      {images.length >= 2 ? (
        <>
          <p className="mb-3 mt-0.5 text-xs text-tx-3">Drag to compare {before.year} and {after.year} · Sentinel-2 · 10 m</p>
          <div className="relative aspect-square w-full select-none overflow-hidden rounded-xl bg-ink-900">
            <img src={after.url} alt={`Satellite image ${after.year}`} className="absolute inset-0 h-full w-full object-cover" />
            <img
              src={before.url}
              alt={`Satellite image ${before.year}`}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div className="absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }} />
            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs text-white">{before.year}</span>
            <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs text-white">{after.year}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              aria-label="Compare years"
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
            />
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-chip px-4 py-7 text-center">
          <ImageOff className="h-5 w-5 text-tx-3" />
          <p className="text-[13px] text-tx-2">Satellite snapshots appear here once Earth Engine is connected.</p>
          <p className="text-xs text-tx-3">Meanwhile, use the timeline on the map to scrub through the years.</p>
        </div>
      )}
      {evidence.vision.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-tx">
            <Eye className="h-4 w-4 text-ac" /> What the images show (Gemini vision)
          </p>
          <ol className="relative mt-2.5 flex flex-col gap-2.5 border-l border-line pl-4">
            {evidence.vision.map((v) => (
              <li key={v.year} className="relative text-[13px] text-tx-2">
                <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${v.water_visible ? "bg-water" : "bg-tx-3"}`} />
                <span className="font-mono text-tx">{v.year}</span>{" "}
                {v.notes.length ? v.notes.join("; ") : v.water_visible ? "Open water visible" : `Construction: ${v.construction_stage}`}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
