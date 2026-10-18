import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  PRIORITY_DEFINITIONS,
  type PriorityLevel,
  useLocalityPriorities,
} from "../../lib/localityPriorities";

const LEVELS: { value: PriorityLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

export function LocalityPriorities() {
  const { priorities, setPriority, reset, isDefault } = useLocalityPriorities();

  return (
    <section className="rounded-2xl border border-line bg-sheet p-4 sm:p-5" aria-labelledby="locality-priorities-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-ac" />
            <h3 id="locality-priorities-title" className="font-display text-[16px] font-semibold text-tx">
              My priorities
            </h3>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-tx-2">
            Personalise the importance of each part of the existing score. This makes no new API calls.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={isDefault}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] font-semibold text-tx-2 transition hover:bg-chip disabled:cursor-default disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      <div className="mt-4 space-y-2.5">
        {PRIORITY_DEFINITIONS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-2 rounded-xl bg-chip px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[13px] font-semibold text-tx">{label}</span>
            <div role="radiogroup" aria-label={`${label} priority`} className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-ink-850 p-1">
              {LEVELS.map((level) => {
                const selected = priorities[key] === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPriority(key, level.value)}
                    className={`min-h-8 rounded-md px-2.5 text-[11.5px] font-semibold transition ${
                      selected ? "bg-ac text-ac-ink" : "text-tx-2 hover:bg-chip hover:text-tx"
                    }`}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-tx-3">
        Green uses the parks share of today’s combined green/social sub-index. Air quality remains evidence only and does not affect either score.
      </p>
    </section>
  );
}
