import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, CheckSquare, Compass, Loader2, MessageCircleQuestion, Printer, Send, Sparkles, Square } from "lucide-react";
import { api } from "../lib/api";
import { DIMENSION_LABEL, LEVEL_STYLE } from "../lib/evidence";
import type { ActionKit, Alternative, AlternativesResponse, Report } from "../lib/types";
import { Tag } from "./ui";

function useTicks(reportId: string) {
  const key = `landlens.ticks.${reportId}`;
  const [ticks, setTicks] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  });
  const toggle = (i: number) =>
    setTicks((t) => {
      const next = { ...t, [i]: !t[i] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return { ticks, toggle };
}

export function NextSteps({
  report,
  onAlternatives,
  onFocusAlternative,
  onInvestigateAlternative,
  onPrint,
}: {
  report: Report;
  onAlternatives: (a: Alternative[]) => void;
  onFocusAlternative: (a: Alternative) => void;
  onInvestigateAlternative: (a: Alternative) => void;
  onPrint: () => void;
}) {
  const [kit, setKit] = useState<ActionKit | null>(report.actions);
  const [kitError, setKitError] = useState(false);
  const [alts, setAlts] = useState<AlternativesResponse | null>(null);
  const [altsBusy, setAltsBusy] = useState(false);
  const [altsError, setAltsError] = useState(false);
  const { ticks, toggle } = useTicks(report.id);

  useEffect(() => {
    if (kit) return;
    api.actions(report.id).then(setKit).catch(() => setKitError(true));
  }, [report.id, kit]);

  const findAlternatives = async () => {
    setAltsBusy(true);
    setAltsError(false);
    try {
      const res = await api.alternatives(report.id);
      setAlts(res);
      onAlternatives(res.alternatives);
    } catch {
      setAltsError(true);
    } finally {
      setAltsBusy(false);
    }
  };

  const shareUrl = window.location.href;
  const whatsapp = kit ? `https://wa.me/?text=${encodeURIComponent(`${kit.share_text} ${shareUrl}`)}` : "#";
  const done = Object.values(ticks).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3">
      {/* share row */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!kit}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366]/15 px-3 py-2.5 text-[13px] font-medium text-[#6ee7a0] ring-1 ring-[#25D366]/30 hover:bg-[#25D366]/25"
        >
          <Send className="h-4 w-4" /> Send on WhatsApp
        </a>
        <button
          onClick={onPrint}
          className="flex items-center justify-center gap-2 rounded-xl bg-chip px-3 py-2.5 text-[13px] font-medium text-tx ring-1 ring-line hover:bg-chip"
        >
          <Printer className="h-4 w-4" /> Evidence pack (PDF)
        </button>
      </div>

      {!kit && !kitError && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-tx-2" role="status">Preparing your site-visit checklist…</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-14 rounded-[14px]" />
          ))}
        </div>
      )}
      {kitError && <p className="text-[13px] text-risk-high-tx">Couldn't prepare next steps right now.</p>}

      {kit && (
        <>
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-tx">
                <CheckSquare className="h-4 w-4 text-ac" /> Site-visit checklist
              </h3>
              <span className="font-mono text-[11px] text-tx-3">
                {done}/{kit.checklist.length}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-1">
              {kit.checklist.map((c, i) => (
                <li key={i}>
                  <button onClick={() => toggle(i)} className="flex w-full gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-chip">
                    {ticks[i] ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-ac" /> : <Square className="mt-0.5 h-4 w-4 shrink-0 text-tx-3" />}
                    <span>
                      <span className={`block text-[13.5px] ${ticks[i] ? "text-tx-3 line-through" : "text-tx"}`}>{c.text}</span>
                      <span className="block text-[12px] text-tx-3">{c.why}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-tx">
              <MessageCircleQuestion className="h-4 w-4 text-ac" /> Ask the builder
            </h3>
            <ol className="mt-3 flex flex-col gap-2.5">
              {kit.builder_questions.map((q, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-chip font-mono text-[11px] text-tx-2">{i + 1}</span>
                  <span>
                    <span className="block text-[13.5px] text-tx">{q.text}</span>
                    <span className="block text-[12px] text-tx-3">{q.why}</span>
                  </span>
                </li>
              ))}
            </ol>
            {kit.generated_by === "gemini" && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-tx-3">
                <Sparkles className="h-3 w-3 text-ac" /> Tailored by Gemini from this report's evidence
              </p>
            )}
          </section>
        </>
      )}

      <section className="card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-tx">
          <Compass className="h-4 w-4 text-ac" /> Safer alternatives nearby
        </h3>
        {!alts ? (
          <>
            <p className="mt-1.5 text-[13px] text-tx-2">Scan 24 spots within 3 km and show lower-risk areas on the map.</p>
            <button
              onClick={findAlternatives}
              disabled={altsBusy}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ac text-[13.5px] font-semibold text-ac-ink transition hover:bg-ac-strong disabled:opacity-60"
            >
              {altsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
              {altsBusy ? "Scanning nearby areas…" : "Find safer areas"}
            </button>
            {altsError && (
              <p className="mt-2 text-[13px] text-risk-high-tx" role="alert">
                We couldn't scan nearby areas right now. Please try again in a moment.
              </p>
            )}
          </>
        ) : alts.alternatives.length === 0 ? (
          <p className="mt-2 text-[13px] text-tx-2">
            {alts.origin_overall === "low" ? "This plot is already among the lowest-risk in the area." : `No lower-risk spots found among ${alts.scanned} scanned.`}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[12px] text-tx-3">
              {alts.alternatives.length} of {alts.scanned} spots scanned have lower risk
              {alts.illustrative && " · illustrative in demo mode"}
            </p>
            {alts.alternatives.map((a, i) => (
              <motion.div
                key={`${a.lat},${a.lng}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="rounded-xl border border-line bg-chip p-3"
              >
                <button onClick={() => onFocusAlternative(a)} className="w-full text-left">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-ac font-mono text-[11px] font-bold text-ac-ink">{i + 1}</span>
                    <span className="text-[13.5px] font-medium text-tx">
                      {a.distance_km} km {a.bearing}
                    </span>
                    <span className={`ml-auto rounded-md border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[a.overall].tile} ${LEVEL_STYLE[a.overall].text}`}>
                      {LEVEL_STYLE[a.overall].label} risk
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {a.highlights.map((h) => (
                      <Tag key={h}>{h}</Tag>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-tx-3">
                    {Object.entries(a.ratings)
                      .map(([d, l]) => `${DIMENSION_LABEL[d as keyof typeof DIMENSION_LABEL]}: ${l}`)
                      .join(" · ")}
                  </p>
                </button>
                <button
                  onClick={() => onInvestigateAlternative(a)}
                  className="mt-2 flex items-center gap-1 text-[12px] font-medium text-ac hover:text-ac-strong"
                >
                  Run a full report here <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
