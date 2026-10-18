import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Columns3, X } from "lucide-react";
import { useLocalityCompare, type LocalityCompareItem } from "../../lib/localityCompare";
import { personalLocalityScore, useLocalityPriorities } from "../../lib/localityPriorities";
import type { POIItem } from "../../lib/types";

type Direction = "min" | "max";

function bestIds(items: LocalityCompareItem[], value: (item: LocalityCompareItem) => number | null, direction: Direction) {
  const available = items
    .map((item) => ({ id: item.locality.id, value: value(item) }))
    .filter((entry): entry is { id: string; value: number } => entry.value !== null && Number.isFinite(entry.value));
  if (available.length < 2) return new Set<string>();
  const best = direction === "min"
    ? Math.min(...available.map((entry) => entry.value))
    : Math.max(...available.map((entry) => entry.value));
  return new Set(available.filter((entry) => entry.value === best).map((entry) => entry.id));
}

function distance(poi: POIItem | null) {
  return poi?.distance_m ?? null;
}

function formatDistance(poi: POIItem | null) {
  if (!poi) return "Not available";
  const value = poi.distance_m < 1000 ? `${poi.distance_m} m` : `${(poi.distance_m / 1000).toFixed(1)} km`;
  return `${poi.name} · ${value}`;
}

function commuteAverage(item: LocalityCompareItem) {
  const values = item.commute?.trips.flatMap((trip) => trip.drive_peak_minutes === null ? [] : [trip.drive_peak_minutes]) ?? [];
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function commuteText(item: LocalityCompareItem) {
  const trips = item.commute?.trips ?? [];
  if (!trips.length) return "Not checked";
  return trips.map((trip) => `${trip.kind}: ${trip.drive_peak_minutes ?? "—"} min peak`).join(" · ");
}

function Best({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-risk-low-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-risk-low-tx">
      <Check className="h-3 w-3" /> Best
    </span>
  );
}

function Metric({ label, value, best }: { label: string; value: string; best: boolean }) {
  return (
    <div className="min-h-[68px] border-t border-line py-3">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-tx-3">{label}</dt>
        <Best show={best} />
      </div>
      <dd className="mt-1 text-[13px] leading-relaxed text-tx">{value}</dd>
    </div>
  );
}

export function LocalityCompareTray({ onOpen }: { onOpen: () => void }) {
  const { items, remove, clear } = useLocalityCompare();
  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="panel flex max-w-[calc(100vw-16px)] items-center gap-2 rounded-2xl p-2 pl-3"
        >
          <Columns3 className="h-4 w-4 shrink-0 text-ac" />
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {items.map((item) => (
              <span key={item.locality.id} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-chip py-1 pl-2.5 pr-1 text-[12.5px] text-tx">
                <span className="max-w-[120px] truncate" title={item.locality.label}>{item.locality.label}</span>
                <button
                  type="button"
                  onClick={() => remove(item.locality.id)}
                  aria-label={`Remove ${item.locality.label}`}
                  className="rounded p-0.5 text-tx-3 hover:text-tx"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpen}
            disabled={items.length < 2}
            className="shrink-0 rounded-xl bg-ac px-3 py-1.5 text-[13px] font-semibold text-ac-ink transition hover:bg-ac-strong disabled:bg-line-2 disabled:text-tx-3"
            title={items.length < 2 ? "Add at least two localities" : undefined}
          >
            Compare {items.length}/3
          </button>
          <button type="button" onClick={clear} className="hidden shrink-0 px-1.5 text-[12px] text-tx-3 hover:text-tx sm:block">
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function LocalityCompareView({ onClose }: { onClose: () => void }) {
  const { items } = useLocalityCompare();
  const { priorities } = useLocalityPriorities();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const defaults = bestIds(items, (item) => item.locality.overall_score, "max");
  const personals = bestIds(items, (item) => personalLocalityScore(item.locality.sub_indices, priorities, item.locality.overall_score), "max");
  const metro = bestIds(items, (item) => distance(item.locality.amenities.nearest_metro), "min");
  const grocery = bestIds(items, (item) => distance(item.locality.amenities.nearest_grocery), "min");
  const school = bestIds(items, (item) => distance(item.locality.amenities.nearest_school), "min");
  const healthcare = bestIds(items, (item) => distance(item.locality.amenities.nearest_hospital), "min");
  const commute = bestIds(items, commuteAverage, "min");
  const air = bestIds(items, (item) => item.air?.index.aqi ?? null, "min");
  const heat = bestIds(items, (item) => item.health?.lst_may_delta_c ?? null, "min");
  const green = bestIds(items, (item) => item.health?.greener_than_surroundings_pct ?? null, "max");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Compare localities"
        className="scroll-thin max-h-full w-full max-w-6xl overflow-y-auto rounded-3xl border border-line bg-ink-850 p-4 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-tx">
              <Columns3 className="h-5 w-5 text-ac" /> Compare localities
            </h2>
            <p className="mt-1 text-[12.5px] text-tx-2">Only evidence already checked in this session is shown. Comparing makes no new API calls.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-tx-2 hover:bg-chip hover:text-tx">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const id = item.locality.id;
            const personal = personalLocalityScore(item.locality.sub_indices, priorities, item.locality.overall_score);
            const averageCommute = commuteAverage(item);
            return (
              <article key={id} className="rounded-2xl border border-line bg-sheet p-4">
                <h3 className="min-h-10 line-clamp-2 font-display text-[15px] font-semibold text-tx" title={item.locality.label}>
                  {item.locality.label}
                </h3>
                <dl className="mt-2">
                  <Metric label="Default score" value={`${item.locality.overall_score}/100`} best={defaults.has(id)} />
                  <Metric label="Your personal score" value={`${personal}/100`} best={personals.has(id)} />
                  <Metric label="Nearest metro" value={formatDistance(item.locality.amenities.nearest_metro)} best={metro.has(id)} />
                  <Metric label="Nearest grocery" value={formatDistance(item.locality.amenities.nearest_grocery)} best={grocery.has(id)} />
                  <Metric label="Nearest school" value={formatDistance(item.locality.amenities.nearest_school)} best={school.has(id)} />
                  <Metric label="Nearest healthcare" value={formatDistance(item.locality.amenities.nearest_hospital)} best={healthcare.has(id)} />
                  <Metric
                    label="Peak commute times"
                    value={averageCommute === null ? "Not checked" : `${averageCommute} min average · ${commuteText(item)}`}
                    best={commute.has(id)}
                  />
                  <Metric
                    label="Current air quality"
                    value={item.air?.index.aqi === null || !item.air ? "Not checked" : `${item.air.index.aqi} AQI · ${item.air.index.category}`}
                    best={air.has(id)}
                  />
                  <Metric
                    label="May surface heat"
                    value={item.health?.lst_may_delta_c === null || !item.health ? "Not checked" : `${item.health.lst_may_delta_c >= 0 ? "+" : ""}${item.health.lst_may_delta_c.toFixed(1)} °C vs nearby median`}
                    best={heat.has(id)}
                  />
                  <Metric
                    label="Neighbourhood green"
                    value={item.health?.greener_than_surroundings_pct === null || !item.health ? "Not checked" : `Greener than ${Math.round(item.health.greener_than_surroundings_pct)}% nearby`}
                    best={green.has(id)}
                  />
                </dl>
              </article>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
