import { useEffect, useState } from "react";
import { api } from "./api";
import { FINAL_STATUSES, type Report } from "./types";

const POLL_MS = 800;

/** Polls a report until it finishes. `missing` turns true if it never appears. */
export function useReport(id: string | null) {
  const [report, setReport] = useState<Report | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setReport(null);
    setMissing(false);
    if (!id) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let misses = 0;
    const tick = async () => {
      try {
        const r = await api.getReport(id);
        if (stop) return;
        if (r) {
          setReport(r);
          if (FINAL_STATUSES.includes(r.status)) return;
        } else if (++misses > 15) {
          setMissing(true); // the POST creates it almost immediately; give up after ~12 s
          return;
        }
      } catch {
        /* transient: keep polling */
      }
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  return { report, setReport, missing };
}
