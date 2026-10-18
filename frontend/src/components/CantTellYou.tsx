import { ListChecks, ShieldAlert } from "lucide-react";
import type { Verdict } from "../lib/types";

export function CheckNext({ verdict }: { verdict: Verdict }) {
  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-tx">
        <ListChecks className="h-4 w-4 text-ac" /> What to check next
      </h3>
      <ul className="mt-2.5 flex flex-col gap-1.5 text-[13.5px] text-tx-2">
        {verdict.check_next.map((c) => (
          <li key={c} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-tx-3" />
            {c}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CantTellYou({ verdict }: { verdict: Verdict }) {
  return (
    <section className="rounded-[14px] border border-warn/30 bg-warn-soft p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-warn">
        <ShieldAlert className="h-4 w-4" /> What GeoMind can't tell you
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-warn">
        GeoMind checks physical and climate history only. Check legal title, encumbrances, approvals and RERA
        registration through official records and a lawyer.
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-[12.5px] text-warn">
        {verdict.limitations.map((l) => (
          <li key={l}>· {l}</li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11px] text-warn">This is not legal, engineering or financial advice.</p>
    </section>
  );
}
