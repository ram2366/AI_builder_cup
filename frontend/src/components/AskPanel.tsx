import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { sectionLabel } from "../lib/evidence";
import type { AskResponse } from "../lib/types";
import { Tag } from "./ui";

const SUGGESTED = ["Does this area flood in heavy rain?", "Was this land ever a lake?", "What should I ask the builder?"];

interface Turn {
  q: string;
  a?: AskResponse;
  error?: string;
}

export function AskPanel({ reportId, suggestions = [] }: { reportId: string; suggestions?: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const suggested = [...new Set([...suggestions, ...SUGGESTED])];

  // Braces matter: newer browsers return a Promise from scrollIntoView, and React would treat it as the cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: text }]);
    const settle = (patch: Partial<Turn>) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, ...patch } : x)));
    try {
      settle({ a: await api.ask(reportId, text, "en") });
    } catch {
      settle({ error: "Couldn't get an answer right now. Try again in a minute." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[13px] text-tx-2">
        <Sparkles className="h-4 w-4 text-ac" /> Gemini answers using only this report's evidence.
      </p>
      {turns.length === 0 && (
        <div className="flex flex-col gap-2">
          {suggested.map((s) => (
            <button key={s} onClick={() => ask(s)} className="card px-3.5 py-2.5 text-left text-[13.5px] text-tx hover:border-line-2">
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ac px-3.5 py-2 text-[13.5px] text-ac-ink"
            >
              {t.q}
            </motion.p>
            {t.a ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`max-w-[92%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  t.a.refused ? "border border-warn/30 bg-warn-soft text-warn" : "card text-tx"
                }`}
              >
                <p>{t.a.answer}</p>
                {t.a.evidence_refs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(t.a.evidence_refs.map((r) => r.split(".")[0]))].map((s) => (
                      <Tag key={s} tone="accent">
                        {sectionLabel(s)}
                      </Tag>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : t.error ? (
              <p className="text-[13px] text-risk-high-tx">{t.error}</p>
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-tx-2">
                <span className="pulse-dot h-2 w-2 rounded-full bg-ac" /> Checking the evidence…
              </p>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="panel sticky bottom-0 flex items-center gap-2 rounded-xl p-1.5 pl-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={500}
          placeholder="Ask about this land…"
          aria-label="Your question"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-tx placeholder:text-tx-3 focus:outline-none"
        />
        <button
          aria-label="Ask"
          disabled={busy || !q.trim()}
          className="grid h-8 w-8 place-items-center rounded-lg bg-ac text-ac-ink transition disabled:bg-line-2 disabled:text-tx-3"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
