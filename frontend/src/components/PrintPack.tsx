import { createPortal } from "react-dom";
import { DIMENSION_LONG, DIMENSION_ORDER, formatValue, resolveRef, sectionLabel } from "../lib/evidence";
import type { Report } from "../lib/types";

/** A clean, light, print-only evidence pack (A4). Hidden on screen; shown by window.print(). */
export function PrintPack({ report }: { report: Report }) {
  const v = report.verdict;
  const ev = report.evidence;
  if (!v || !ev) return null;
  const demo = report.versions.evidence_provider === "mock";
  return createPortal(
    <article className="print-pack">
      <header>
        <div>
          <p className="pp-brand">GeoMind · Evidence pack</p>
          <h1>{report.location.label ?? "Selected plot"}</h1>
          <p className="pp-muted">
            {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)} · {report.location.geometry
              ? `${Math.round(report.location.geometry.area_m2 ?? 0).toLocaleString()} m² custom boundary`
              : `radius ${report.radius_m} m`} · generated{" "}
            {new Date(report.created_at * 1000).toLocaleString()}
          </p>
        </div>
        <div className="pp-id">
          Report SP-{report.id.slice(0, 6).toUpperCase()}
          <br />
          SHA-256 {report.evidence_sha256?.slice(0, 16)}…
        </div>
      </header>
      {demo && <p className="pp-warn">ILLUSTRATIVE DEMO DATA. Not real measurements.</p>}

      <section>
        <h2>Verdict: {v.overall.toUpperCase()} physical risk</h2>
        <p className="pp-lead">{v.headline}</p>
        <p>{v.summary}</p>
        <table>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Rating</th>
              <th>Confidence</th>
              <th>Sources</th>
            </tr>
          </thead>
          <tbody>
            {DIMENSION_ORDER.filter((d) => report.ratings[d]).map((d) => {
              const r = report.ratings[d]!;
              return (
                <tr key={d}>
                  <td>{DIMENSION_LONG[d]}</td>
                  <td className={`pp-${r.level}`}>{r.level}</td>
                  <td>{r.confidence}</td>
                  <td>{r.sources.join(", ") || "n/a"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Findings and evidence</h2>
        <ol>
          {report.findings.map((f) => (
            <li key={f.id}>
              <p>{f.claim}</p>
              <p className="pp-refs">
                {f.evidence_refs.map((r) => `${sectionLabel(r)}: ${r} = ${formatValue(resolveRef(ev, r))}`).join("  ·  ")}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {report.actions && (
        <section>
          <h2>Questions for the builder</h2>
          <ol>
            {report.actions.builder_questions.map((q, i) => (
              <li key={i}>{q.text}</li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2>Limitations</h2>
        <ul>
          {v.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="pp-muted">
          GeoMind summarises public satellite and climate records about physical history. It does not predict future events and
          is not legal, engineering or financial advice. Verify title and approvals with official records. Verified claims:{" "}
          {report.verifier?.passed}/{report.verifier?.checked}. Pipeline {report.versions.pipeline} · {report.versions.reasoner}.
        </p>
      </section>
    </article>,
    document.body,
  );
}
