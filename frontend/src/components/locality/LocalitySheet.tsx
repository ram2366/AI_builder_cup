import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Bus,
  Car,
  CheckCircle2,
  Check,
  Columns3,
  AlertTriangle,
  Activity,
  Clock3,
  ExternalLink,
  GraduationCap,
  HeartPulse,
  Loader2,
  MapPin,
  Share2,
  ShoppingCart,
  Sparkles,
  ThermometerSun,
  Train,
  Trees,
  Utensils,
  X,
} from "lucide-react";
import { CommandSearch } from "../CommandSearch";
import { LocalityPriorities } from "./LocalityPriorities";
import { api } from "../../lib/api";
import { useLocalityCompare } from "../../lib/localityCompare";
import type { Place } from "../../lib/geocode";
import { personalLocalityScore, useLocalityPriorities } from "../../lib/localityPriorities";
import type { AirQualityReport, CommuteDestination, CommuteKind, CommuteReport, LocalityReport, NeighborhoodHealth, POICategory, POIItem } from "../../lib/types";

interface Props {
  locality: LocalityReport | null;
  loading: boolean;
  error?: string | null;
  onBack: () => void;
  /** Rendered inside the plot workspace: no back arrow, brand or title of its own. */
  embedded?: boolean;
  onFocusPOI: (poi: POIItem) => void;
  airHeatmapVisible: boolean;
  onAirHeatmapChange: (visible: boolean) => void;
}

const CATEGORY_META: Record<
  POICategory,
  { label: string; icon: any; color: string; bg: string; border: string }
> = {
  transit: {
    label: "Transit",
    icon: Train,
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.12)",
    border: "rgba(59, 130, 246, 0.3)",
  },
  grocery: {
    label: "Groceries",
    icon: ShoppingCart,
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.3)",
  },
  healthcare: {
    label: "Healthcare",
    icon: HeartPulse,
    color: "#ec4899",
    bg: "rgba(236, 72, 153, 0.12)",
    border: "rgba(236, 72, 153, 0.3)",
  },
  education: {
    label: "Schools",
    icon: GraduationCap,
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.12)",
    border: "rgba(139, 92, 246, 0.3)",
  },
  social: {
    label: "Dining & Social",
    icon: Utensils,
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.3)",
  },
  green: {
    label: "Parks & Green",
    icon: Trees,
    color: "#14b8a6",
    bg: "rgba(20, 184, 166, 0.12)",
    border: "rgba(20, 184, 166, 0.3)",
  },
};

function formatDist(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function walkMins(meters: number): string {
  const m = Math.max(1, Math.round(meters / 80));
  return `${m} min walk`;
}

function linePath(values: number[], width = 300, height = 72, pad = 6): string {
  if (values.length < 2) return "";
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  return values
    .map((value, index) => `${index ? "L" : "M"}${pad + (index / (values.length - 1)) * (width - pad * 2)},${height - pad - ((value - low) / span) * (height - pad * 2)}`)
    .join(" ");
}

function HistoryLine({ values, label, color = "var(--color-ac)" }: { values: number[]; label: string; color?: string }) {
  if (values.length < 2) return null;
  return (
    <svg viewBox="0 0 300 72" className="mt-3 h-[72px] w-full" role="img" aria-label={label}>
      <line x1="6" x2="294" y1="66" y2="66" stroke="var(--color-line)" />
      <path d={linePath(values)} fill="none" stroke={color} strokeWidth="2.2" />
    </svg>
  );
}

function pollutantUnit(unit: string): string {
  return unit === "MICROGRAMS_PER_CUBIC_METER" ? "µg/m³" : unit.replaceAll("_", " ").toLowerCase();
}

export function LocalitySheet({ locality, loading, error, onBack, embedded = false, onFocusPOI, airHeatmapVisible, onAirHeatmapChange }: Props) {
  const { priorities } = useLocalityPriorities();
  const localityCompare = useLocalityCompare();
  const [activeTab, setActiveTab] = useState<"overview" | "amenities" | "commute" | "air" | "climate" | "community">("overview");
  const [poiFilter, setPoiFilter] = useState<POICategory | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const [commuteKind, setCommuteKind] = useState<CommuteKind>("office");
  const [commuteStops, setCommuteStops] = useState<CommuteDestination[]>([]);
  const [commuteReport, setCommuteReport] = useState<CommuteReport | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const [airReport, setAirReport] = useState<AirQualityReport | null>(null);
  const [airLoading, setAirLoading] = useState(false);
  const [airError, setAirError] = useState<string | null>(null);
  const [neighborhoodHealth, setNeighborhoodHealth] = useState<NeighborhoodHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    setCommuteStops([]);
    setCommuteReport(null);
    setCommuteError(null);
    setAirReport(null);
    setAirError(null);
    setNeighborhoodHealth(null);
    setHealthError(null);
  }, [locality?.id]);

  useEffect(() => {
    if (!locality || !localityCompare.has(locality.id)) return;
    localityCompare.addOrUpdate({
      locality,
      commute: commuteReport,
      air: airReport,
      health: neighborhoodHealth,
    });
    // Only refresh the saved snapshot when checked evidence changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locality, commuteReport, airReport, neighborhoodHealth]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  const filteredPois = useMemo(() => {
    if (!locality) return [];
    if (poiFilter === "all") return locality.amenities.pois;
    return locality.amenities.pois.filter((p) => p.category === poiFilter);
  }, [locality, poiFilter]);

  const addCommuteStop = (place: Place) => {
    const label = [place.name, place.detail].filter(Boolean).join(", ").slice(0, 120);
    const stop: CommuteDestination = { kind: commuteKind, label, lat: place.lat, lng: place.lng };
    setCommuteStops((current) => [...current.filter((item) => item.kind !== commuteKind), stop]);
    setCommuteReport(null);
    setCommuteError(null);
  };

  const checkCommutes = async () => {
    if (!locality || commuteStops.length === 0) return;
    setCommuteLoading(true);
    setCommuteError(null);
    try {
      setCommuteReport(await api.commute(locality.lat, locality.lng, commuteStops));
    } catch (caught) {
      setCommuteReport(null);
      setCommuteError(caught instanceof Error ? caught.message : "Commute times are unavailable right now. Please try again.");
    } finally {
      setCommuteLoading(false);
    }
  };

  const checkAir = async () => {
    if (!locality) return;
    setAirLoading(true);
    setAirError(null);
    try {
      setAirReport(await api.airQuality(locality.lat, locality.lng));
    } catch (caught) {
      setAirReport(null);
      setAirError(caught instanceof Error ? caught.message : "Air quality is unavailable right now. Please try again.");
    } finally {
      setAirLoading(false);
    }
  };

  const checkNeighborhoodHealth = async () => {
    if (!locality) return;
    setHealthLoading(true);
    setHealthError(null);
    try {
      setNeighborhoodHealth(await api.neighborhoodHealth(locality.lat, locality.lng));
    } catch (caught) {
      setNeighborhoodHealth(null);
      setHealthError(caught instanceof Error ? caught.message : "Neighbourhood heat and green evidence is unavailable right now.");
    } finally {
      setHealthLoading(false);
    }
  };

  if (loading || !locality) {
    return (
      <div className="relative flex h-full flex-col bg-ink-850">
        {!embedded && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3 sm:px-7">
            <button
              onClick={onBack}
              aria-label="Back"
              className="-ml-1.5 grid h-8 w-8 place-items-center rounded-lg text-tx-2 hover:bg-chip hover:text-tx"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="font-display text-[17px] font-bold tracking-tight">Locality & Life</span>
          </div>
        )}
        {error && !loading ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <AlertTriangle className="h-8 w-8 text-warn" />
            <h3 className="mt-4 font-display text-[19px] font-semibold text-tx">Couldn't load nearby places</h3>
            <p className="mt-2 max-w-sm text-sm text-tx-2">{error}</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="h-10 w-10 rounded-full border-2 border-ac border-t-transparent"
            />
            <h3 className="mt-5 font-display text-[19px] font-semibold text-tx">Checking what's nearby…</h3>
            <p className="mt-2 max-w-sm text-sm text-tx-2">
              Finding real shops, schools, clinics and transit from Google Maps, and what residents write about the area.
            </p>
          </div>
        )}
      </div>
    );
  }

  const personalScore = personalLocalityScore(locality.sub_indices, priorities, locality.overall_score);
  const compareItem = { locality, commute: commuteReport, air: airReport, health: neighborhoodHealth };
  const isCompared = localityCompare.has(locality.id);
  const scoreClass = (score: number) =>
    score >= 80 ? "text-risk-low" : score >= 65 ? "text-ac" : score >= 50 ? "text-risk-moderate" : "text-risk-high";

  return (
    <div className="relative flex h-full flex-col bg-ink-850">
      {/* Top Bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-3 sm:px-7">
        {!embedded && (
          <>
            <button
              onClick={onBack}
              aria-label="Back to map"
              className="-ml-1.5 grid h-8 w-8 place-items-center rounded-lg text-tx-2 hover:bg-chip hover:text-tx"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <span className="font-display text-[20px] font-bold tracking-[-0.03em]">GeoMind</span>
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-bold tracking-wide text-ac uppercase">
                Locality Lens
              </span>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => isCompared ? localityCompare.remove(locality.id) : localityCompare.addOrUpdate(compareItem)}
            disabled={!isCompared && localityCompare.full}
            aria-label={isCompared ? "Remove locality from compare" : "Add locality to compare"}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-tx transition hover:bg-chip disabled:cursor-not-allowed disabled:opacity-45"
            title={!isCompared && localityCompare.full ? "Compare tray is full" : undefined}
          >
            {isCompared ? <Check className="h-3.5 w-3.5 text-risk-low" /> : <Columns3 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isCompared ? "Added" : "Add to compare"}</span>
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).then(
                () => flash("Link copied"),
                () => flash("Copy link from address bar")
              );
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-tx hover:bg-chip"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </div>

      {/* Sheet Content Scroll */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-16 pt-5 sm:px-7">
        {/* Place Header */}
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-tx-3">
            Neighbourhood check · {(locality.radius_m / 1000).toFixed(1)} km around the plot · {locality.amenities.source}
          </p>
          {!embedded && (
            <h2
              className="mt-1 truncate font-display text-[22px] font-bold tracking-tight text-tx"
              title={locality.label}
            >
              {locality.label}
            </h2>
          )}
        </div>

        {/* Hero Score Card */}
        <div className="mt-5 rounded-2xl border border-line bg-sheet p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-tx-3">Liveability Index</span>
              <h3 className="mt-1 font-display text-[20px] font-semibold tracking-tight text-tx">
                {locality.verdict_headline}
              </h3>
              <p className="mt-1 text-[14px] leading-relaxed text-tx-2">{locality.verdict_summary}</p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-center">
              <div className="bg-chip px-4 py-3">
                <span className={`block font-display text-[32px] font-black leading-none ${scoreClass(locality.overall_score)}`}>
                  {locality.overall_score}
                </span>
                <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-wider text-tx-2">Default score</span>
              </div>
              <div className="bg-chip px-4 py-3">
                <span className={`block font-display text-[32px] font-black leading-none ${scoreClass(personalScore)}`}>
                  {personalScore}
                </span>
                <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-wider text-tx-2">Your score</span>
              </div>
            </div>
          </div>

          {/* Quick Proximity Pill Bar */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 border-t border-line pt-4">
            {locality.amenities.nearest_metro && (
              <div
                onClick={() => onFocusPOI(locality.amenities.nearest_metro!)}
                className="cursor-pointer rounded-lg bg-chip p-2.5 transition hover:bg-line"
              >
                <div className="flex items-center gap-1.5 text-blue-400">
                  <Train className="h-3.5 w-3.5" />
                  <span className="text-[11.5px] font-semibold">Metro</span>
                </div>
                <div className="mt-1 font-display text-[15px] font-bold text-tx">
                  {formatDist(locality.amenities.nearest_metro.distance_m)}
                </div>
                <div className="text-[11px] text-tx-3">{walkMins(locality.amenities.nearest_metro.distance_m)}</div>
              </div>
            )}
            {locality.amenities.nearest_grocery && (
              <div
                onClick={() => onFocusPOI(locality.amenities.nearest_grocery!)}
                className="cursor-pointer rounded-lg bg-chip p-2.5 transition hover:bg-line"
              >
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span className="text-[11.5px] font-semibold">Grocery</span>
                </div>
                <div className="mt-1 font-display text-[15px] font-bold text-tx">
                  {formatDist(locality.amenities.nearest_grocery.distance_m)}
                </div>
                <div className="text-[11px] text-tx-3">{walkMins(locality.amenities.nearest_grocery.distance_m)}</div>
              </div>
            )}
            {locality.amenities.nearest_school && (
              <div
                onClick={() => onFocusPOI(locality.amenities.nearest_school!)}
                className="cursor-pointer rounded-lg bg-chip p-2.5 transition hover:bg-line"
              >
                <div className="flex items-center gap-1.5 text-purple-400">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span className="text-[11.5px] font-semibold">School</span>
                </div>
                <div className="mt-1 font-display text-[15px] font-bold text-tx">
                  {formatDist(locality.amenities.nearest_school.distance_m)}
                </div>
                <div className="text-[11px] text-tx-3">{walkMins(locality.amenities.nearest_school.distance_m)}</div>
              </div>
            )}
            {locality.amenities.nearest_hospital && (
              <div
                onClick={() => onFocusPOI(locality.amenities.nearest_hospital!)}
                className="cursor-pointer rounded-lg bg-chip p-2.5 transition hover:bg-line"
              >
                <div className="flex items-center gap-1.5 text-pink-400">
                  <HeartPulse className="h-3.5 w-3.5" />
                  <span className="text-[11.5px] font-semibold">Healthcare</span>
                </div>
                <div className="mt-1 font-display text-[15px] font-bold text-tx">
                  {formatDist(locality.amenities.nearest_hospital.distance_m)}
                </div>
                <div className="text-[11px] text-tx-3">{walkMins(locality.amenities.nearest_hospital.distance_m)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="scroll-thin mt-6 flex overflow-x-auto border-b border-line">
          <button
            onClick={() => setActiveTab("overview")}
            className={`relative mr-6 shrink-0 whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
              activeTab === "overview" ? "text-tx" : "text-tx-3 hover:text-tx"
            }`}
          >
            Sub-Index Breakdown
            {activeTab === "overview" && (
              <motion.span layoutId="loc-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tx" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("amenities")}
            className={`relative mr-6 shrink-0 whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
              activeTab === "amenities" ? "text-tx" : "text-tx-3 hover:text-tx"
            }`}
          >
            Amenities ({locality.amenities.pois.length})
            {activeTab === "amenities" && (
              <motion.span layoutId="loc-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tx" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("commute")}
            className={`relative mr-6 shrink-0 whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
              activeTab === "commute" ? "text-tx" : "text-tx-3 hover:text-tx"
            }`}
          >
            Commute
            {activeTab === "commute" && (
              <motion.span layoutId="loc-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tx" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("air")}
            className={`relative mr-6 shrink-0 whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
              activeTab === "air" ? "text-tx" : "text-tx-3 hover:text-tx"
            }`}
          >
            Air
            {activeTab === "air" && (
              <motion.span layoutId="loc-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tx" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("climate")}
            className={`relative mr-6 shrink-0 whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
              activeTab === "climate" ? "text-tx" : "text-tx-3 hover:text-tx"
            }`}
          >
            Heat &amp; green
            {activeTab === "climate" && (
              <motion.span layoutId="loc-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tx" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("community")}
            className={`relative shrink-0 whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
              activeTab === "community" ? "text-tx" : "text-tx-3 hover:text-tx"
            }`}
          >
            Community Voices
            {activeTab === "community" && (
              <motion.span layoutId="loc-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-tx" />
            )}
          </button>
        </div>

        {/* TAB 1: OVERVIEW & SUB-INDICES */}
        {activeTab === "overview" && (
          <div className="mt-6 space-y-4">
            <LocalityPriorities />
            {Object.entries(locality.sub_indices).map(([key, sub]) => {
              const barColor =
                sub.score >= 80 ? "#10b981" : sub.score >= 65 ? "#3b82f6" : sub.score >= 50 ? "#f59e0b" : "#ef4444";
              return (
                <div key={key} className="rounded-xl border border-line bg-sheet p-4 transition hover:border-line-2">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[15px] font-semibold text-tx">{sub.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-tx-3 font-mono">Weight {Math.round(sub.weight * 100)}%</span>
                      <span className="rounded-md px-2 py-0.5 font-mono text-[13px] font-bold" style={{ color: barColor, backgroundColor: `${barColor}18` }}>
                        {sub.score}/100
                      </span>
                    </div>
                  </div>
                  {/* Progress track */}
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-chip">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${sub.score}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: barColor }}
                    />
                  </div>
                  <p className="mt-2 text-[13px] text-tx-2">{sub.summary}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 2: AMENITIES & POIS */}
        {activeTab === "amenities" && (
          <div className="mt-6">
            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPoiFilter("all")}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition ${
                  poiFilter === "all" ? "bg-tx text-ink-850" : "bg-chip text-tx-2 hover:bg-line"
                }`}
              >
                All ({locality.amenities.pois.length})
              </button>
              {(Object.keys(CATEGORY_META) as POICategory[]).map((cat) => {
                const count = locality.amenities.counts_by_category[cat] || 0;
                const meta = CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => setPoiFilter(cat)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition ${
                      poiFilter === cat ? "bg-tx text-ink-850" : "bg-chip text-tx-2 hover:bg-line"
                    }`}
                  >
                    <meta.icon className="h-3 w-3" />
                    <span>{meta.label}</span>
                    <span className="text-[11px] opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* POI Cards */}
            <div className="mt-4 space-y-2.5">
              {filteredPois.map((poi) => {
                const meta = CATEGORY_META[poi.category];
                return (
                  <div
                    key={poi.id}
                    onClick={() => onFocusPOI(poi)}
                    className="group flex cursor-pointer items-center justify-between rounded-xl border border-line bg-sheet p-3 transition hover:border-ac hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        <meta.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate font-display text-[14px] font-semibold text-tx group-hover:text-ac">
                          {poi.name}
                        </h4>
                        <p className="text-[12px] text-tx-3">
                          {poi.detail || meta.label}
                          {poi.rating ? ` · ★ ${poi.rating.toFixed(1)} (${poi.ratings ?? 0})` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <div className="font-mono text-[13px] font-semibold text-tx">{formatDist(poi.distance_m)}</div>
                      <div className="text-[11px] text-tx-3">{walkMins(poi.distance_m)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: USER-SELECTED COMMUTES (explicit Routes API check; never scored) */}
        {activeTab === "commute" && (
          <div className="mt-6 space-y-5">
            <div>
              <h3 className="font-display text-[17px] font-semibold text-tx">Where do you travel regularly?</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-tx-2">
                Add up to three destinations. Times are checked only when you ask and do not change the liveability score.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(["office", "school", "parents"] as CommuteKind[]).map((kind) => (
                <button
                  key={kind}
                  onClick={() => setCommuteKind(kind)}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold capitalize transition ${
                    commuteKind === kind ? "bg-tx text-ink-850" : "bg-chip text-tx-2 hover:bg-line"
                  }`}
                >
                  {kind === "parents" ? "Family" : kind}
                </button>
              ))}
            </div>

            <CommandSearch
              near={{ lat: locality.lat, lng: locality.lng }}
              onSelect={addCommuteStop}
              placeholder={`Search ${commuteKind === "parents" ? "family" : commuteKind} destination`}
            />

            {commuteStops.length > 0 && (
              <div className="space-y-2">
                {commuteStops.map((stop) => (
                  <div key={stop.kind} className="flex items-center gap-3 rounded-xl border border-line bg-sheet px-3.5 py-3">
                    <MapPin className="h-4 w-4 shrink-0 text-ac" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-tx-3">
                        {stop.kind === "parents" ? "Family" : stop.kind}
                      </p>
                      <p className="truncate text-[13.5px] font-semibold text-tx" title={stop.label}>{stop.label}</p>
                    </div>
                    <button
                      onClick={() => {
                        setCommuteStops((current) => current.filter((item) => item.kind !== stop.kind));
                        setCommuteReport(null);
                      }}
                      aria-label={`Remove ${stop.kind} destination`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tx-3 hover:bg-chip hover:text-tx"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={checkCommutes}
              disabled={commuteStops.length === 0 || commuteLoading}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ac px-4 py-2.5 text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              {commuteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
              {commuteLoading ? "Checking live routes…" : "Check commute times"}
            </button>

            {commuteError && (
              <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-[13px] leading-relaxed text-tx-2">
                <span className="font-semibold text-warn">We couldn't check those routes. </span>{commuteError}
              </div>
            )}

            {commuteReport && (
              <div className="space-y-3">
                <div className="rounded-xl border border-line bg-chip p-3 text-[12px] leading-relaxed text-tx-2">
                  Comparing Monday 9:00 am traffic with 2:00 pm in {commuteReport.timezone.replace("_", " ")}. Transit is checked for 9:00 am.
                </div>
                {commuteReport.trips.map((trip) => (
                  <div key={trip.kind} className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-ac">
                          {trip.kind === "parents" ? "Family" : trip.kind}
                        </p>
                        <h4 className="mt-0.5 truncate font-display text-[15px] font-semibold text-tx" title={trip.label}>{trip.label}</h4>
                      </div>
                      {trip.distance_km !== null && <span className="shrink-0 font-mono text-[12px] text-tx-3">{trip.distance_km} km</span>}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-chip p-2.5">
                        <div className="flex items-center gap-1 text-[11px] text-tx-3"><Car className="h-3 w-3" /> Mon 9 am</div>
                        <p className="mt-1 font-display text-[18px] font-bold text-tx">{trip.drive_peak_minutes !== null ? `${trip.drive_peak_minutes} min` : "Unavailable"}</p>
                      </div>
                      <div className="rounded-lg bg-chip p-2.5">
                        <div className="flex items-center gap-1 text-[11px] text-tx-3"><Car className="h-3 w-3" /> Mon 2 pm</div>
                        <p className="mt-1 font-display text-[18px] font-bold text-tx">{trip.drive_offpeak_minutes !== null ? `${trip.drive_offpeak_minutes} min` : "Unavailable"}</p>
                      </div>
                      <div className="rounded-lg bg-chip p-2.5">
                        <div className="flex items-center gap-1 text-[11px] text-tx-3"><Clock3 className="h-3 w-3" /> Peak gap</div>
                        <p className="mt-1 font-display text-[18px] font-bold text-tx">
                          {trip.peak_gap_minutes !== null ? `${trip.peak_gap_minutes >= 0 ? "+" : ""}${trip.peak_gap_minutes} min` : "Unavailable"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-chip p-2.5">
                        <div className="flex items-center gap-1 text-[11px] text-tx-3"><Bus className="h-3 w-3" /> Transit</div>
                        <p className="mt-1 font-display text-[18px] font-bold text-tx">{trip.transit_minutes !== null ? `${trip.transit_minutes} min` : "Unavailable"}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-[11.5px] leading-relaxed text-tx-3">
                  Source: {commuteReport.source}. Checked {new Date(commuteReport.checked_at).toLocaleString()}. Future travel times are estimates and can change with traffic or service schedules.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CURRENT + HISTORIC AIR EVIDENCE (explicit, never scored) */}
        {activeTab === "air" && (
          <div className="mt-6 space-y-5">
            <div>
              <h3 className="font-display text-[17px] font-semibold text-tx">Air around this neighbourhood</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-tx-2">
                Check current local AQI, the last 30 days, and long-term satellite NO₂ context. Air evidence does not change the liveability score.
              </p>
            </div>

            {!airReport && (
              <button
                onClick={checkAir}
                disabled={airLoading}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ac px-4 py-2.5 text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                {airLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                {airLoading ? "Checking current and historic air…" : "Check air quality"}
              </button>
            )}

            {airError && (
              <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-[13px] leading-relaxed text-tx-2">
                <span className="font-semibold text-warn">We couldn't check air quality. </span>{airError}
              </div>
            )}

            {airReport && (
              <>
                <div className="rounded-2xl border border-line bg-sheet p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-tx-3">{airReport.index.display_name}</p>
                      <h4 className="mt-1 font-display text-[19px] font-semibold text-tx">{airReport.index.category}</h4>
                      <p className="mt-1 text-[12.5px] text-tx-2">
                        Dominant pollutant: {airReport.index.dominant_pollutant?.toUpperCase() ?? "not reported"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-chip px-4 py-3 text-center">
                      <p className="font-display text-[36px] font-black leading-none text-ac">{airReport.index.aqi_display}</p>
                      <p className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-tx-3">AQI</p>
                    </div>
                  </div>
                  {airReport.pollutants.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                      {airReport.pollutants.map((pollutant) => (
                        <span key={pollutant.code} title={pollutant.full_name} className="rounded-full bg-chip px-2.5 py-1 text-[11.5px] text-tx-2">
                          {pollutant.display_name} {pollutant.concentration} {pollutantUnit(pollutant.units)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {airReport.history_daily.length >= 2 && (
                  <figure className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-tx">30-day AQI history</p>
                        <p className="text-[11.5px] text-tx-3">Daily mean of available hourly {airReport.index.display_name} readings</p>
                      </div>
                      <span className="font-mono text-[11px] text-tx-3">{airReport.history_daily.length} days</span>
                    </div>
                    <HistoryLine values={airReport.history_daily.map((day) => day.aqi_mean)} label={`Daily ${airReport.index.display_name} over ${airReport.history_period}`} />
                    <div className="flex justify-between font-mono text-[10.5px] text-tx-3">
                      <span>{airReport.history_daily[0].date}</span>
                      <span>{airReport.history_daily.at(-1)?.date}</span>
                    </div>
                  </figure>
                )}

                {airReport.no2 && Object.keys(airReport.no2.by_year).length >= 2 && (
                  <figure className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-bold text-tx">Long-term NO₂ context</p>
                        <p className="text-[11.5px] text-tx-3">Annual Sentinel-5P tropospheric column within 1 km</p>
                      </div>
                      <span className="font-mono text-[11px] text-tx-3">{airReport.no2.unit}</span>
                    </div>
                    <HistoryLine values={Object.values(airReport.no2.by_year)} label={`Annual NO2 from ${airReport.no2.period}`} color="var(--color-signal)" />
                    <div className="flex justify-between font-mono text-[10.5px] text-tx-3">
                      <span>{Object.keys(airReport.no2.by_year)[0]}</span>
                      <span>{Object.keys(airReport.no2.by_year).at(-1)}</span>
                    </div>
                    <p className="mt-2 text-[11.5px] text-tx-3">
                      {airReport.no2.trend?.significant
                        ? `${airReport.no2.trend.slope_per_year > 0 ? "+" : ""}${airReport.no2.trend.slope_per_year.toFixed(2)} ${airReport.no2.unit}/yr · p ${airReport.no2.trend.p_value.toFixed(3)}`
                        : "No statistically significant multi-year trend in the available annual series."}
                    </p>
                  </figure>
                )}

                <button
                  onClick={() => onAirHeatmapChange(!airHeatmapVisible)}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-chip px-4 py-2.5 text-[13px] font-semibold text-tx hover:border-ac"
                >
                  <MapPin className="h-4 w-4 text-ac" />
                  {airHeatmapVisible ? "Hide current air heatmap" : "Show current air heatmap"}
                </button>

                <p className="text-[11.5px] leading-relaxed text-tx-3">
                  Current and 30-day source: {airReport.source}, approximately {airReport.resolution_m} m, checked {new Date(airReport.checked_at).toLocaleString()}. NO₂ is regional satellite context, not a street-level monitor. Conditions can change hour to hour.
                </p>
                {airReport.unavailable.length > 0 && (
                  <p className="text-[11.5px] text-warn">Unavailable: {airReport.unavailable.join(", ")}.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 5: 1 KM NEIGHBOURHOOD HEAT + GREEN (reuses Land Health; never scored yet) */}
        {activeTab === "climate" && (
          <div className="mt-6 space-y-5">
            <div>
              <h3 className="font-display text-[17px] font-semibold text-tx">Heat and green within 1 km</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-tx-2">
                Compare this neighbourhood's vegetation and May surface heat with the measured area within 5 km. These satellite signals do not change the score yet.
              </p>
            </div>

            {!neighborhoodHealth && (
              <button
                onClick={checkNeighborhoodHealth}
                disabled={healthLoading}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ac px-4 py-2.5 text-[13.5px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-45"
              >
                {healthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trees className="h-4 w-4" />}
                {healthLoading ? "Reading neighbourhood satellites…" : "Check heat and green"}
              </button>
            )}

            {healthError && (
              <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-[13px] leading-relaxed text-tx-2">
                <span className="font-semibold text-warn">We couldn't check heat and green. </span>{healthError}
              </div>
            )}

            {neighborhoodHealth && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <article className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-center gap-2 text-emerald-400"><Trees className="h-4 w-4" /><span className="text-[12px] font-bold uppercase tracking-wider">Vegetation</span></div>
                    <p className="mt-3 font-display text-[28px] font-black text-tx">
                      {neighborhoodHealth.recent_ndvi !== null ? neighborhoodHealth.recent_ndvi.toFixed(2) : "Unavailable"}
                    </p>
                    <p className="text-[12px] text-tx-3">Recent median NDVI · 1 km</p>
                    <p className="mt-2 text-[13px] text-tx-2">
                      {neighborhoodHealth.greener_than_surroundings_pct !== null
                        ? `Greener than ${Math.round(neighborhoodHealth.greener_than_surroundings_pct)}% of measured land within 5 km.`
                        : "Surrounding-area comparison unavailable."}
                    </p>
                  </article>
                  <article className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-center gap-2 text-orange-400"><ThermometerSun className="h-4 w-4" /><span className="text-[12px] font-bold uppercase tracking-wider">May surface heat</span></div>
                    <p className="mt-3 font-display text-[28px] font-black text-tx">
                      {neighborhoodHealth.recent_lst_may_c !== null ? `${neighborhoodHealth.recent_lst_may_c.toFixed(1)} °C` : "Unavailable"}
                    </p>
                    <p className="text-[12px] text-tx-3">Recent Landsat LST · 1 km</p>
                    <p className="mt-2 text-[13px] text-tx-2">
                      {neighborhoodHealth.lst_may_delta_c !== null
                        ? `${neighborhoodHealth.lst_may_delta_c >= 0 ? "+" : ""}${neighborhoodHealth.lst_may_delta_c.toFixed(1)} °C versus the median within 5 km.`
                        : "Surrounding-area comparison unavailable."}
                    </p>
                  </article>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.values(neighborhoodHealth.by_year).filter((row) => row.ndvi_median !== null).length >= 2 && (
                    <figure className="rounded-xl border border-line bg-sheet p-4">
                      <p className="text-[13px] font-bold text-tx">NDVI history</p>
                      <p className="text-[11.5px] text-tx-3">Annual 1 km neighbourhood vegetation</p>
                      <HistoryLine values={Object.values(neighborhoodHealth.by_year).flatMap((row) => row.ndvi_median === null ? [] : [row.ndvi_median])} label={`Neighbourhood NDVI from ${neighborhoodHealth.period}`} color="var(--color-risk-low)" />
                      <p className="mt-1 text-[11.5px] text-tx-3">
                        {neighborhoodHealth.ndvi_trend?.significant
                          ? `${neighborhoodHealth.ndvi_trend.slope_per_year > 0 ? "+" : ""}${neighborhoodHealth.ndvi_trend.slope_per_year.toFixed(3)}/yr · p ${neighborhoodHealth.ndvi_trend.p_value.toFixed(3)}`
                          : "No statistically significant annual trend."}
                      </p>
                    </figure>
                  )}
                  {Object.values(neighborhoodHealth.by_year).filter((row) => row.lst_may_c !== null).length >= 2 && (
                    <figure className="rounded-xl border border-line bg-sheet p-4">
                      <p className="text-[13px] font-bold text-tx">May LST history</p>
                      <p className="text-[11.5px] text-tx-3">Annual 1 km neighbourhood surface heat</p>
                      <HistoryLine values={Object.values(neighborhoodHealth.by_year).flatMap((row) => row.lst_may_c === null ? [] : [row.lst_may_c])} label={`Neighbourhood May surface temperature from ${neighborhoodHealth.period}`} color="var(--color-signal)" />
                      <p className="mt-1 text-[11.5px] text-tx-3">
                        {neighborhoodHealth.lst_trend?.significant
                          ? `${neighborhoodHealth.lst_trend.slope_per_year > 0 ? "+" : ""}${neighborhoodHealth.lst_trend.slope_per_year.toFixed(2)} °C/yr · p ${neighborhoodHealth.lst_trend.p_value.toFixed(3)}`
                          : "No statistically significant annual trend."}
                      </p>
                    </figure>
                  )}
                </div>

                <p className="text-[11.5px] leading-relaxed text-tx-3">
                  Green source: {neighborhoodHealth.source}, {neighborhoodHealth.resolution_m} m. Heat source: {neighborhoodHealth.lst_source}, {neighborhoodHealth.lst_resolution_m} m. Period {neighborhoodHealth.period}; current comparison uses the two latest complete years. Surface heat is not air temperature.
                </p>
              </>
            )}
          </div>
        )}

        {/* TAB 6: WHAT PEOPLE SAY (grounded on Google Search; shown, never scored) */}
        {activeTab === "community" && (
          <div className="mt-6 space-y-6">
            {!locality.sentiment.available ? (
              <div className="rounded-xl border border-line bg-sheet p-4 text-[14px] text-tx-2">
                Not enough public discussion about this area was found to summarise. Nothing is shown rather than guessed.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-line bg-sheet p-4">
                  <div className="flex items-center gap-2 text-ac">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[13px] font-semibold uppercase tracking-wider">What residents say</span>
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-tx-2">{locality.sentiment.summary}</p>
                  <p className="mt-2 text-[11.5px] text-tx-3">
                    Summarised by Gemini from {locality.sentiment.sources.length} web pages found with Google Search. Opinions only; not part of the score.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-[13px] font-semibold">What residents praise</span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {locality.sentiment.pros.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-tx-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-line bg-sheet p-4">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-[13px] font-semibold">Watch-outs residents raise</span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {locality.sentiment.cons.map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-tx-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-[16px] font-semibold text-tx">Sources</h3>
                  <p className="text-[12.5px] text-tx-3">The pages Gemini read. Open them to judge for yourself.</p>
                  <div className="mt-3 space-y-2">
                    {locality.sentiment.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sheet px-3.5 py-3 transition hover:border-line-2 hover:bg-chip"
                      >
                        <span className="truncate text-[13.5px] font-semibold text-tx">{src.domain}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ac" />
                      </a>
                    ))}
                  </div>
                  {locality.sentiment.search_entry_html && (
                    // Google's required search-suggestions chip for grounded answers, isolated from our styles.
                    <iframe
                      title="Google Search suggestions"
                      srcDoc={locality.sentiment.search_entry_html}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      className="mt-3 h-[72px] w-full rounded-lg border-0 bg-transparent"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-sheet shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
