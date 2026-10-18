import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X, Bookmark, BookmarkCheck, Check, Columns3, FileDown, Link2, Printer, Send, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { contextualAskSuggestions } from "../../lib/askSuggestions";
import { DIMENSION_LONG, LEVEL_STYLE, formatValue, resolveRef, sectionLabel } from "../../lib/evidence";
import { floodYear as getFloodYear, layerForDimension, timelineYears, waterShare } from "../../lib/layers";
import { hasWaterSignal, rankSalientDimensions, strongestChangeSignal } from "../../lib/salience";
import { useCompare, useSaved } from "../../lib/saved";
import type { Alternative, Dimension, Evidence, Finding, Level, LocalityReport, Report } from "../../lib/types";
import { FINAL_STATUSES } from "../../lib/types";
import { AskPanel } from "../AskPanel";
import { BrochurePanel } from "../BrochurePanel";
import { CantTellYou } from "../CantTellYou";
import { NextSteps } from "../NextSteps";
import { PrintPack } from "../PrintPack";
import { ProgressTimeline } from "../ProgressTimeline";
import { TimeMachine } from "../TimeMachine";
import { LandStream } from "./LandStream";
import { LandHealthPanel } from "./LandHealthPanel";
import { MoreMenu, type MenuAction } from "./Menus";
import { ADVICE } from "./Overview";
import { QUESTIONS } from "./questions";
import { StoryChart } from "./StoryChart";
import { WaterCalendar } from "./WaterCalendar";
import { Passport } from "../workspace/Passport";
import { WorkspaceTabs, type WorkspaceTab } from "../workspace/WorkspaceTabs";

export type SheetTab = WorkspaceTab;

const LEVEL_N: Record<Level, number> = { low: 1, moderate: 2, elevated: 3, high: 4 };
const CONF_N = { high: 3, medium: 2, low: 1 } as const;

function checkedSource(ev: Evidence, dimension: Dimension): string {
  if (dimension === "water_body") return ev.jrc?.source ?? ev.water_years?.source ?? "Satellite records";
  if (dimension === "flood") return ev.monsoon?.source ?? ev.s1?.source ?? ev.historic_floods?.source ?? ev.flood_hazard?.source ?? "Satellite records";
  if (dimension === "terrain") return ev.terrain?.source ?? "Terrain records";
  if (dimension === "green") return ev.landcover?.source ?? "Land-cover records";
  if (dimension === "land_health") return ev.land_health?.source ?? "Land-health records";
  return ev.rain?.source ?? "Rainfall records";
}

interface Props {
  report: Report | null;
  missing: boolean;
  onBack: () => void;
  onReportChange: (r: Report) => void;
  onShowOnMap: (d: Dimension) => void;
  year: string | null;
  onAlternatives: (a: Alternative[]) => void;
  onFocusAlternative: (a: Alternative) => void;
  onInvestigateAlternative: (a: Alternative) => void;
  onCompareWith: (r: Report) => void;
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
  /** The Neighbourhood tab body (loads only once that tab is opened). */
  neighbourhood: ReactNode;
  locality: LocalityReport | null;
  onAsk: () => void;
}

export function ReportSheet(props: Props) {
  const { report, missing, onBack, onReportChange, onShowOnMap, year, tab } = props;
  const saved = useSaved();
  const compare = useCompare();
  const [summaryView, setSummaryView] = useState<"summary" | "next">("summary");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setSummaryView("summary"), [report?.id]);

  const shown = report;
  const done = !!report && FINAL_STATUSES.includes(report.status);
  const ok = done && report?.status !== "error" && !!shown?.verdict && !!report?.evidence;
  const demo = report?.versions.evidence_provider === "mock";

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };
  const go = (t: WorkspaceTab | "next") => {
    if (t === "next") setSummaryView("next");
    else {
      setSummaryView("summary");
      props.onTab(t);
    }
    document.getElementById("sheet-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const print = () => {
    if (report && !report.actions) {
      api.actions(report.id).then((a) => {
        onReportChange({ ...report, actions: a });
        setTimeout(() => window.print(), 150);
      }).catch(() => window.print());
    } else window.print();
  };

  const isSaved = report ? saved.isSaved(report.id) : false;
  const toggleSave = () => {
    if (!report) return;
    saved.toggle({
      reportId: report.id,
      label: report.location.label ?? "Plot",
      lat: report.location.lat,
      lng: report.location.lng,
      radius_m: report.radius_m,
      overall: report.verdict?.overall ?? null,
      savedAt: Date.now(),
    });
    flash(isSaved ? "Removed from your plots" : "Saved to your plots");
  };

  const menu: MenuAction[] = report
    ? [
        {
          label: compare.has(report.id) ? "In compare list" : "Add to compare",
          icon: <Columns3 className="h-4 w-4" />,
          active: compare.has(report.id),
          disabled: !compare.has(report.id) && compare.full,
          hint: `${compare.items.length}/3`,
          onClick: () => compare.toggle({ reportId: report.id, label: report.location.label ?? "Plot", overall: report.verdict?.overall ?? null }),
        },
        {
          label: "Send on WhatsApp",
          icon: <Send className="h-4 w-4" />,
          onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(`GeoMind report for ${report.location.label ?? "a plot"}: ${window.location.href}`)}`, "_blank"),
        },
        { label: "Evidence pack (PDF)", icon: <Printer className="h-4 w-4" />, onClick: print },
      ]
    : [];

  const dateStr = report ? new Date(report.created_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const body = tab === "summary" && summaryView === "next" ? "next" : tab;
  const waiting = tab !== "neighbourhood" && !ok;

  return (
    <div className="relative flex h-full flex-col bg-ink-850">
      {ok && report && <PrintPack report={report} />}

      {/* header */}
      <div className="shrink-0 px-5 pb-3 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="lbl">
              Plot report · {report?.location.geometry
                ? `${Math.round(report.location.geometry.area_m2 ?? 0).toLocaleString()} m² custom boundary`
                : `${report?.radius_m ?? "—"} m around your pin`}{dateStr && ` · ${dateStr}`}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-[19px] font-semibold leading-snug tracking-tight text-tx">{report?.location.label ?? "Selected plot"}</h2>
              {demo && <span className="rounded-md bg-warn-soft px-2 py-0.5 text-[11.5px] font-bold text-warn">Demo data</span>}
            </div>
          </div>
          {report && (
            <button
              type="button"
              onClick={props.onAsk}
              aria-label="Ask Gemini"
              title="Ask Gemini · shortcut A"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ac/40 bg-ac/10 px-2.5 text-[12.5px] font-semibold text-ac hover:bg-ac/20"
            >
              <Sparkles className="h-3.5 w-3.5" /> <span>Ask</span>
            </button>
          )}
          <button onClick={onBack} aria-label="Back to map" title="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tx-2 hover:bg-chip hover:text-tx">
            <X className="h-4 w-4" />
          </button>
        </div>
        {ok && report && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button onClick={toggleSave} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-tx hover:bg-chip" aria-pressed={isSaved}>
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5 text-ac" /> : <Bookmark className="h-3.5 w-3.5" />}
              <span>{isSaved ? "Saved" : "Save"}</span>
            </button>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).then(() => flash("Link copied"), () => flash("Copy the address bar to share"));
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13px] text-tx hover:bg-chip"
            >
              <Link2 className="h-3.5 w-3.5" /> <span>Share</span>
            </button>
            <MoreMenu actions={menu} />
          </div>
        )}
        {ok && report && (
          <div className="mt-3">
            <Passport report={report} locality={props.locality} asOf={dateStr} onOpen={(t) => go(t)} />
          </div>
        )}
      </div>

      {report && <WorkspaceTabs value={tab} onChange={(t) => go(t)} />}

      <div id="sheet-scroll" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {!report && !missing && (
          <div className="px-5 py-8" role="status">
            <p className="font-display text-[20px] font-semibold text-tx">Opening your land check…</p>
            <p className="mt-2 text-sm text-tx-2">This usually takes only a moment.</p>
          </div>
        )}

        {missing && (
          <div className="px-5 py-8" role="alert">
            <p className="font-display text-[20px] font-semibold text-tx">This report is no longer available</p>
            <p className="mt-2 text-sm text-tx-2">Return to the map and run a fresh check for this plot.</p>
          </div>
        )}

        {report && waiting && !done && (
          <div className="px-5 pb-10 pt-5">
            <p className="font-display text-[24px] font-bold leading-tight tracking-tight">Reading 40 years of this land…</p>
            <p className="mt-2 text-[14.5px] text-tx-2">Gemini is checking water history, floods, terrain and land change. Every claim will be verified. About 40 s.</p>
            <div className="mt-6 border-t border-line pt-5">
              <ProgressTimeline report={report} />
            </div>
          </div>
        )}

        {report && waiting && done && report.status === "error" && (
          <div className="mx-5 my-6 rounded-xl bg-risk-high-soft p-4" role="alert">
            <p className="font-semibold text-risk-high-tx">We couldn't finish this land check</p>
            <p className="mt-1 text-sm text-risk-high-tx/90">Please return to the map and try again. Your selected location is still safe to re-check.</p>
          </div>
        )}

        {report && (tab === "neighbourhood" || (ok && shown)) && (
          <AnimatePresence mode="wait">
            <motion.div
              key={body}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={tab === "neighbourhood" ? "h-full" : "flex flex-col gap-9 px-5 pb-14 pt-6"}
            >
              {tab === "neighbourhood" && props.neighbourhood}
              {tab !== "neighbourhood" && ok && shown && (
                <>
                  {body === "summary" && <Overview report={report} shown={shown} onGo={go} onShowOnMap={onShowOnMap} onCompareWith={() => props.onCompareWith(report)} />}
                  {body === "risk" && <RiskView report={report} shown={shown} year={year} onPrint={print} onCompare={() => compare.toggle({ reportId: report.id, label: report.location.label ?? "Plot", overall: report.verdict?.overall ?? null })} />}
                  {body === "health" && <HealthView report={report} />}
                  {body === "next" && (
                    <>
                      <button onClick={() => go("summary")} className="-mb-4 flex items-center gap-1.5 self-start text-[13px] font-semibold text-ac hover:text-ac-strong">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to summary
                      </button>
                      <NextSteps
                        report={report}
                        onAlternatives={props.onAlternatives}
                        onFocusAlternative={props.onFocusAlternative}
                        onInvestigateAlternative={props.onInvestigateAlternative}
                        onPrint={print}
                      />
                      <section>
                        <h3 className="mb-3 font-display text-[18px] font-semibold tracking-tight">Check the builder's brochure</h3>
                        <BrochurePanel reportId={report.id} />
                      </section>
                    </>
                  )}
                  {body === "ask" && <AskPanel reportId={report.id} suggestions={contextualAskSuggestions(report)} />}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            role="status"
            className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-tx px-3.5 py-2 text-[13px] text-ink-850 shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================= Overview ================= */

function Overview({
  report,
  shown,
  onGo,
  onShowOnMap,
  onCompareWith,
}: {
  report: Report;
  shown: Report;
  onGo: (t: WorkspaceTab | "next") => void;
  onShowOnMap: (d: Dimension) => void;
  onCompareWith: () => void;
}) {
  const v = shown.verdict!;
  const s = LEVEL_STYLE[v.overall];
  const ev = report.evidence!;
  const ai = report.versions.reasoner === "gemini-agent";
  const clearItems = QUESTIONS.flatMap((question) => {
    const rating = report.ratings[question.dim];
    return rating?.level === "low" ? [{ question, source: checkedSource(ev, question.dim) }] : [];
  });
  const standout = rankSalientDimensions(report).flatMap((dimension) => {
    const question = QUESTIONS.find((item) => item.dim === dimension);
    const rating = report.ratings[dimension];
    const related = shown.findings.filter((finding) => finding.dimension === dimension);
    const finding = related.find((item) => item.severity === "concern") ?? related.find((item) => item.rating_change) ?? related[0];
    return question && rating && finding ? [{ dimension, question, rating, finding }] : [];
  });
  const change = strongestChangeSignal(ev);
  const greenQuestion = QUESTIONS.find((question) => question.dim === "green")!;
  return (
    <>
      <header>
        <h1 className="font-display text-[clamp(28px,2.6vw,38px)] font-bold leading-[1.08] tracking-[-0.02em] text-tx [text-wrap:balance]">{v.headline}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-tx-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold" style={{ background: s.soft, color: s.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} /> {s.label} risk
          </span>
          {report.verifier && <span>{report.verifier.passed} of {report.verifier.checked} facts checked against satellite records</span>}
          <button onClick={() => onGo("risk")} className="inline-flex items-center gap-1 font-bold text-ac hover:text-ac-strong">
            See the evidence <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-tx-2">{ADVICE[v.overall]}</p>
        {ai && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-tx-3">
            <Sparkles className="h-3.5 w-3.5 text-ac" /> Investigated by Gemini
          </p>
        )}
      </header>

      <section>
        <SectionTitle title="What stands out" />
        {standout.length ? (
          <div className="grid gap-3">
            {standout.map(({ dimension, question, rating, finding }) => {
              const ls = LEVEL_STYLE[rating.level];
              const Icon = question.icon;
              const citations = [...new Map(finding.evidence_refs.map((ref) => [sectionLabel(ref), ref])).entries()];
              const canMap = layerForDimension(dimension) !== null;
              return (
                <article key={dimension} className="overflow-hidden rounded-2xl border border-line bg-chip/40 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: ls.soft, color: ls.color }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-tx-3">{question.question}</p>
                        <span className="rounded-lg px-2.5 py-1 text-[12px] font-bold" style={{ background: ls.soft, color: ls.color }}>
                          {question.answers[rating.level]}
                        </span>
                      </div>
                      <p className="mt-2 text-[15px] font-semibold leading-relaxed text-tx">{finding.claim}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-line bg-ink-850/50 p-3">
                    {dimension === "green" ? <LandStream ev={ev} /> : <question.Viz ev={ev} color={ls.color} />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {citations.map(([label, ref]) => (
                      <span key={label} title={ref} className="rounded-full border border-line px-2 py-1 text-[10.5px] font-semibold text-tx-3">
                        {label}
                      </span>
                    ))}
                    {canMap && (
                      <button onClick={() => onShowOnMap(dimension)} className="ml-auto text-[12px] font-bold text-ac hover:text-ac-strong">
                        Show on map
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-risk-low/30 bg-risk-low-soft p-4 sm:p-5">
            <div className="flex items-center gap-2.5 text-risk-low-tx">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-risk-low-soft"><Check className="h-4 w-4" /></span>
              <p className="text-[15px] font-bold">No red flags in the records we checked</p>
            </div>
            {clearItems.slice(0, 2).map(({ question }) => (
              <p key={question.dim} className="ml-10 mt-1.5 text-[13px] text-tx-2">{question.line(ev)}</p>
            ))}
          </div>
        )}
      </section>

      {clearItems.length > 0 && (
        <section>
          <SectionTitle title="Checked and clear" />
          <div className="divide-y divide-line border-y border-line">
            {clearItems.map(({ question, source }) => (
              <div key={question.dim} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 py-2.5 text-[13px]">
                <Check className="mt-0.5 h-4 w-4 text-risk-low-tx" />
                <p className="text-tx-2">
                  <span className="text-tx">{question.line(ev)}</span> <span className="text-tx-3">· {source}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="What changed here" />
        {change === "water" && <StoryChart ev={ev} />}
        {change === "built" && <LandStream ev={ev} />}
        {change === "green" && <greenQuestion.Viz ev={ev} color={LEVEL_STYLE[report.ratings.green?.level ?? "low"].color} />}
        {change === "stable" && <p className="rounded-xl border border-line bg-chip/40 p-4 text-[14px] text-tx-2">Land use has been stable since 2016.</p>}
        {change === "unavailable" && <p className="rounded-xl border border-line bg-chip/40 p-4 text-[14px] text-tx-2">No clear land-cover change signal is available.</p>}
      </section>

      <CantTellYou verdict={shown.verdict!} />

      <div className="grid gap-2.5 sm:grid-cols-[1.25fr_1fr]">
        <button onClick={() => onGo("next")} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-ac text-[15px] font-bold text-ac-ink transition hover:bg-ac-strong">
          What should I do? <ArrowRight className="h-4 w-4" />
        </button>
        <button onClick={onCompareWith} className="h-12 rounded-xl border border-line-2 text-[14.5px] font-bold text-tx hover:bg-chip">
          Compare with another plot
        </button>
      </div>
    </>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-[18px] font-semibold tracking-tight text-tx">{title}</h3>
      {note && <p className="text-[13px] text-tx-3">{note}</p>}
    </div>
  );
}

/* ================= Evidence ================= */

function Meter({ level }: { level: Level }) {
  const n = LEVEL_N[level];
  return (
    <span className="inline-flex gap-[3px]" aria-label={`${LEVEL_STYLE[level].label}`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className="h-[7px] w-[13px]" style={{ background: i <= n ? (level === "high" ? LEVEL_STYLE.high.color : "var(--color-tx)") : "var(--color-line-2)" }} />
      ))}
    </span>
  );
}

function Spark({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return <span className="text-[11.5px] text-tx-3">—</span>;
  const w = 96;
  const h = 20;
  const max = Math.max(...vals) || 1;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 5)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function trend(ev: Evidence, d: Dimension): { vals: number[]; color: string } {
  if (d === "water_body") return { vals: timelineYears(ev).map((y) => waterShare(ev, y)), color: "var(--color-water)" };
  if (d === "flood" && ev.monsoon) {
    const ys = Object.keys(ev.monsoon.obs_per_year).sort();
    return { vals: ys.map((y) => (ev.monsoon!.seen.includes(Number(y)) ? 1 : 0)), color: "var(--color-flood)" };
  }
  if (d === "flood" && ev.historic_floods) {
    return { vals: ev.historic_floods.events.map((event) => event.flooded_fraction), color: "var(--color-flood)" };
  }
  if (d === "green" && ev.landcover) {
    const g = ev.landcover.green_by_year;
    return { vals: Object.keys(g).sort().map((y) => g[y]), color: "var(--color-tx)" };
  }
  if (d === "land_health" && ev.land_health) {
    const years = Object.keys(ev.land_health.by_year).sort();
    return { vals: years.flatMap((year) => ev.land_health!.by_year[year].ndvi_median ?? []), color: "var(--color-risk-low)" };
  }
  return { vals: [], color: "" };
}

function keyValue(ev: Evidence, d: Dimension): string {
  if (d === "water_body" && ev.jrc) return `${ev.jrc.occurrence_core_pct}% water`;
  if (d === "flood" && ev.monsoon) return `${ev.monsoon.seen.length}/${ev.monsoon.observed_years} wet seasons`;
  if (d === "flood" && ev.historic_floods) return `${ev.historic_floods.events.length} mapped events`;
  if (d === "terrain" && ev.terrain) return `FABDEM ${ev.terrain.relative_height_500m_m > 0 ? "+" : ""}${ev.terrain.relative_height_500m_m} m`;
  if (d === "green" && ev.landcover) {
    const windows = ev.landcover.comparison_windows;
    if (windows) {
      const green = (cover: typeof windows.baseline.mean) => cover.trees + cover.grass + cover.shrub_and_scrub;
      return `${Math.round(green(windows.baseline.mean) * 100)}% → ${Math.round(green(windows.recent.mean) * 100)}%`;
    }
    const years = Object.keys(ev.landcover.green_by_year).sort();
    return `${Math.round(ev.landcover.green_by_year[years[0]] * 100)}% → ${Math.round(ev.landcover.green_by_year[years[years.length - 1]] * 100)}%`;
  }
  if (d === "rain" && ev.rain) return `${ev.rain.heavy_days_per_year_avg} d/yr`;
  if (d === "land_health" && ev.land_health) {
    const slope = ev.land_health.trends.ndvi?.slope_per_year;
    return slope === undefined ? "Stable" : `${slope > 0 ? "+" : ""}${slope.toFixed(3)} NDVI/yr`;
  }
  return "—";
}

function RiskView({ report, shown, year, onPrint, onCompare }: { report: Report; shown: Report; year: string | null; onPrint: () => void; onCompare: () => void }) {
  const ev = report.evidence!;
  const v = shown.verdict!;
  const s = LEVEL_STYLE[v.overall];
  const fy = getFloodYear(ev);
  const [copied, setCopied] = useState(false);
  const api_line = `GET /v1/reports/SP-${report.id.slice(0, 6).toUpperCase()}?fields=ratings,evidence`;
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-tx-2">
        <span>SP-{report.id.slice(0, 6).toUpperCase()}</span>
        <span>
          {report.location.lat.toFixed(5)} N · {report.location.lng.toFixed(5)} E
        </span>
        <span>{report.location.geometry ? `${Math.round(report.location.geometry.area_m2 ?? 0).toLocaleString()} m² boundary` : `r ${report.radius_m} m`}</span>
        {report.verifier && (
          <span>
            {report.verifier.passed}/{report.verifier.checked} claims verified
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="lbl">Physical risk assessment</p>
          <h1 className="mt-1.5 font-display text-[24px] font-bold leading-tight tracking-tight [text-wrap:balance]">{v.headline}</h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-[26px] font-bold tracking-wide" style={{ color: s.color }}>
            {s.label.toUpperCase()}
          </p>
          <Meter level={v.overall} />
        </div>
      </div>
      <p className="border-l-[3px] py-2.5 pl-3.5 pr-3 text-[14px]" style={{ borderColor: s.color, background: s.soft }}>
        {v.summary}
      </p>

      <section>
        <SectionTitle title="Water" note={hasWaterSignal(ev) ? "Historic and recent water observations inside the plot" : undefined} />
        {hasWaterSignal(ev) ? (
          <div className="flex flex-col gap-6">
            <div>
              <StoryChart ev={ev} mode="axis" year={year} />
              <p className="mt-1.5 font-mono text-[11px] text-tx-3">
                Water history: JRC Surface Water (30 m) to 2021 · Dynamic World (10 m) after
              </p>
            </div>
            {ev.water_months && (
              <div>
                <p className="mb-2 text-[13px] font-semibold text-tx">Monthly observations</p>
                <WaterCalendar ev={ev} floodYear={fy} />
              </div>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-xl border border-line bg-chip/40 p-4 text-[13.5px] text-tx-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-risk-low-tx" />
            <span>{QUESTIONS.find((question) => question.dim === "water_body")!.line(ev)}</span>
          </p>
        )}
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-tx-3">
              {["Check", "Rating", "Key value", "Trend", "Source", "Conf."].map((h) => (
                <th key={h} className="border-b border-tx pb-2 pr-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["water_body", "flood", "terrain", "land_health", "green", "rain"] as Dimension[])
              .filter((d) => report.ratings[d])
              .map((d) => {
                const r = report.ratings[d]!;
                const t = trend(ev, d);
                return (
                  <tr key={d} className="border-b border-line">
                    <td className="py-2.5 pr-3 font-semibold">{DIMENSION_LONG[d]}</td>
                    <td className="py-2.5 pr-3">
                      <Meter level={r.level} />
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[12.5px] tabular-nums">{keyValue(ev, d)}</td>
                    <td className="py-2.5 pr-3">
                      <Spark vals={t.vals} color={t.color} />
                    </td>
                    <td className="py-2.5 pr-3 text-[11.5px] text-tx-3">{r.sources[0] ?? "—"}</td>
                    <td className="py-2.5 font-mono tracking-[1px]">{"●".repeat(CONF_N[r.confidence]) + "○".repeat(3 - CONF_N[r.confidence])}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </section>

      {(ev.historic_floods || ev.flood_hazard) && (
        <section>
          <SectionTitle title="Independent flood evidence" note="Event archive plus a coarse regional hazard screen" />
          <div className="grid gap-3 sm:grid-cols-2">
            {ev.historic_floods && (
              <article className="rounded-xl border border-line bg-chip/40 p-4">
                <p className="lbl">Global Flood Database</p>
                <p className="mt-2 text-[14px] font-semibold text-tx">
                  {ev.historic_floods.events.length
                    ? `${ev.historic_floods.events.length} mapped event(s) crossed the area`
                    : "No mapped event crossed the area"}
                </p>
                <p className="mt-1 text-[12.5px] text-tx-3">
                  {ev.historic_floods.events.length
                    ? `Largest mapped share ${Math.round(ev.historic_floods.max_flooded_fraction * 100)}% · latest ${ev.historic_floods.latest_event_year}`
                    : `Archive coverage ${ev.historic_floods.period}; absence is not proof of no flooding`}
                </p>
                <p className="mt-3 font-mono text-[11px] text-tx-3">MODIS-derived · ~250 m effective resolution</p>
              </article>
            )}
            {ev.flood_hazard && (
              <article className="rounded-xl border border-line bg-chip/40 p-4">
                <p className="lbl">WRI Aqueduct</p>
                <p className="mt-2 text-[14px] font-semibold text-tx">
                  {Math.round(ev.flood_hazard.exposed_fraction * 100)}% of this area in the regional riverine hazard footprint
                </p>
                <p className="mt-1 text-[12.5px] text-tx-3">
                  {ev.flood_hazard.return_period_years}-year historical baseline · modelled maximum {ev.flood_hazard.inundation_depth_max_m.toFixed(2)} m
                </p>
                <p className="mt-3 font-mono text-[11px] text-tx-3">1 km regional model · not property-level mapping</p>
              </article>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-6 sm:grid-cols-2">
        {ev.monsoon && (
          <div>
            <p className="lbl mb-2 flex justify-between">
              <span>Wet-season water</span>
              <span className="font-mono normal-case tracking-normal">{Object.keys(ev.monsoon.obs_per_year).sort().slice(0, 1)}–now</span>
            </p>
            <div className="grid grid-cols-9 gap-1">
              {Object.keys(ev.monsoon.obs_per_year)
                .sort()
                .map((y) => {
                  const wet = ev.monsoon!.seen.includes(Number(y));
                  const f = fy === Number(y);
                  return (
                    <div
                      key={y}
                      className="grid aspect-square place-items-center border font-mono text-[10px]"
                      style={{
                        background: f ? "var(--color-flood)" : wet ? "var(--color-water)" : "var(--color-chip)",
                        borderColor: f ? "var(--color-flood)" : wet ? "var(--color-water)" : "var(--color-line)",
                        color: f || wet ? "var(--color-ink-850)" : "var(--color-tx-3)",
                      }}
                    >
                      {y.slice(2)}
                    </div>
                  );
                })}
            </div>
            <p className="mt-2 text-[11px] text-tx-3">
              CHIRPS wet months: {ev.monsoon.wet_months.map((month) => new Date(2020, month - 1, 1).toLocaleString(undefined, { month: "short" })).join(", ")}
            </p>
          </div>
        )}
        <div className="min-w-0">
          <p className="lbl mb-2 flex justify-between">
            <span>Evidence ledger</span>
            <span className="font-mono normal-case tracking-normal">{shown.findings.length} claims</span>
          </p>
          <Ledger findings={shown.findings} ev={ev} />
        </div>
      </section>

      {ev.news.length > 0 && (
        <section>
          <p className="lbl mb-2">Local reports</p>
          {ev.news.map((n) => (
            <a key={n.url} href={n.url} target="_blank" rel="noreferrer" className="block border-b border-line py-2 text-[13.5px] text-ac hover:text-ac-strong">
              {n.date} · {n.title}
            </a>
          ))}
        </section>
      )}


      <section>
        <SectionTitle title="Use this report" />
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button onClick={onPrint} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-ac text-[14px] font-bold text-ac-ink hover:bg-ac-strong">
            <FileDown className="h-4 w-4" /> Export evidence pack
          </button>
          <button onClick={onCompare} className="h-11 rounded-xl border border-line-2 text-[14px] font-bold text-tx hover:bg-chip">
            Add to compare
          </button>
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(api_line).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }, () => {});
          }}
          className="mt-2.5 flex w-full items-center gap-2 overflow-x-auto whitespace-nowrap rounded-lg border border-line bg-chip px-3 py-2.5 text-left font-mono text-[12px] text-tx-2"
          title="Copy API request"
        >
          <span className="font-semibold text-ac">API</span> {api_line}
          <span className="ml-auto text-tx-3">{copied ? <Check className="h-3.5 w-3.5" /> : "copy"}</span>
        </button>
      </section>

      <CantTellYou verdict={shown.verdict!} />
    </>
  );
}


function HealthView({ report }: { report: Report }) {
  const ev = report.evidence!;
  return (
    <>
      {ev.land_health && (
        <section>
          <SectionTitle title="Land health" note="Vegetation, wetness, built-up intensity, moisture and surface heat" />
          <LandHealthPanel health={ev.land_health} />
        </section>
      )}

      {!ev.land_health && (
        <p className="rounded-xl border border-line bg-chip/40 p-4 text-[13.5px] text-tx-2">Not enough data: no land-health evidence was available for this plot.</p>
      )}
      <section>
        <SectionTitle title="What the land became" note="Land cover inside the selected area, first and latest year" />
        <LandStream ev={ev} />
      </section>

      {ev.buildings && (
        <section>
          <SectionTitle title="When buildings appeared" note="Open Buildings detections, not legal records or exact construction dates" />
          <div className="rounded-xl border border-line bg-chip/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[14px] font-semibold text-tx">
                  {ev.buildings.first_detected_year === null
                    ? `No confident building detection in ${ev.buildings.period}`
                    : ev.buildings.first_detected_year === 2016
                      ? "Buildings were present by the first available year, 2016"
                      : `Buildings were first detected in ${ev.buildings.first_detected_year}`}
                </p>
                <p className="mt-1 text-[12.5px] text-tx-3">
                  {ev.buildings.strongest_growth_year === null
                    ? "No clear single-year count increase"
                    : `Strongest mapped count increase: ${ev.buildings.strongest_growth_year}`}
                </p>
              </div>
              <Spark
                vals={Object.keys(ev.buildings.by_year).sort().map((year) => ev.buildings!.by_year[year].estimated_count)}
                color="var(--color-tx)"
              />
            </div>
            <p className="mt-3 font-mono text-[11px] text-tx-3">
              Google Open Buildings 2.5D Temporal · effective 4 m · {ev.buildings.period}
            </p>
          </div>
        </section>
      )}

      {ev.images.length >= 2 && <TimeMachine evidence={ev} />}
    </>
  );
}

function Ledger({ findings, ev }: { findings: Finding[]; ev: Evidence }) {
  return (
    <div className="border-t border-tx text-[13px]">
      {findings.map((f, i) => (
        <details key={f.id} className="group border-b border-line py-2">
          <summary className="grid cursor-pointer list-none grid-cols-[28px_minmax(0,1fr)] gap-2 [&::-webkit-details-marker]:hidden">
            <span className="font-mono text-tx-3">F{i + 1}</span>
            <span className="text-tx">{f.claim}</span>
          </summary>
          <div className="ml-[36px] mt-1.5 flex flex-col gap-0.5 font-mono text-[11px] text-tx-3">
            {f.evidence_refs.map((r) => (
              <span key={r} className="break-all">
                {sectionLabel(r)} · {r} = <span className="text-tx-2">{formatValue(resolveRef(ev, r))}</span>
              </span>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
