"""Report pipeline:
evidence fan-out -> rules -> investigation (agent, or default drill-downs) -> rules again
-> findings (agent writer, or templates) -> verifier -> verdict -> translation.

Every agent stage falls back to the deterministic path on error, so a report is always produced.
Progress is written to the store after every stage so the UI can show live steps by polling.
"""

import hashlib
import json
import logging
import time
import uuid

from app.agent import fallback, llm, translate, writer
from app.agent.investigator import Investigation, default_drilldowns
from app.agent.verifier import verify
from app.config import get_settings
from app.rules import overall_level, rate_all
from app.schemas import Location, ProgressStep, Report, ReportRequest
from app.services.store import get_store
from app.tools.provider import get_provider

log = logging.getLogger(__name__)
MIN_AGENT_FINDINGS = 2


def new_report(req: ReportRequest) -> Report:
    return Report(
        id=req.report_id or uuid.uuid4().hex[:12],
        status="queued",
        location=Location(lat=req.lat, lng=req.lng, label=req.label, geometry=req.geometry),
        radius_m=req.radius_m,
        lang=req.lang,
        created_at=time.time(),
    )


def run_report(req: ReportRequest, report: Report) -> Report:
    settings = get_settings()
    store = get_store()
    use_agent = llm.agent_enabled()
    reasoner = "gemini-agent" if use_agent else "template"

    def progress(step: str, msg: str) -> None:
        report.progress.append(ProgressStep(step=step, msg=msg, ts=time.time()))
        store.save(report)

    try:
        report.status = "evidence"
        progress("start", "Location confirmed")
        provider = get_provider()
        evidence = provider.collect(req, progress)
        report.evidence = evidence
        drill = provider.drilldowns(req, evidence)

        report.status = "investigating"
        ratings = rate_all(evidence)
        progress("rules", "Baseline ratings from transparent rules")

        notes = ""
        if use_agent:
            progress("agent", "Gemini investigator is reviewing the evidence")
            try:
                inv = Investigation(req, evidence, ratings, drill, progress)
                notes = inv.run()
                progress("agent", f"Investigation finished ({inv.calls} follow-up checks)")
            except Exception:
                log.exception("investigator failed; using default drill-downs")
                default_drilldowns(req, evidence, drill, progress)
        else:
            default_drilldowns(req, evidence, drill, progress)
        ratings = rate_all(evidence)  # radar / news can change the rule-based baseline

        report.status = "verifying"
        result = None
        agent_out = None
        if use_agent:
            progress("write", "Writing cited findings")
            try:
                result, agent_out, fixed = writer.write(evidence, ratings, notes)
                if fixed:
                    progress("verify", "Some claims failed verification; Gemini repaired them")
                if result.stats.dropped:
                    log.warning("agent still had %d rejected findings after repair; using templates", result.stats.dropped)
                    result, agent_out = None, None
                elif len(result.findings) < MIN_AGENT_FINDINGS:
                    log.warning("agent produced too few verified findings; using templates")
                    result, agent_out = None, None
            except Exception:
                log.exception("writer failed; using templates")
        if result is None:
            reasoner = "template" if not use_agent else "gemini-agent+template-findings"
            result = verify(fallback.build_findings(evidence, ratings), evidence, ratings)
        else:
            # Salient rule-based dimensions must always have a cited finding for the Overview card,
            # even when the writer omitted one. Fill only missing dimensions with verified templates.
            covered = {finding.dimension for finding in result.findings}
            land_health = result.ratings.get("land_health")
            missing = (
                {"land_health"}
                if land_health and land_health.level in ("moderate", "elevated", "high") and "land_health" not in covered
                else set()
            )
            extras = [finding for finding in fallback.build_findings(evidence, result.ratings) if finding.dimension in missing]
            if extras:
                combined = result.findings + [finding.model_copy(update={"id": f"f{len(result.findings) + i}"}) for i, finding in enumerate(extras, start=1)]
                result = verify(combined, evidence, result.ratings)

        report.ratings = result.ratings
        report.findings = result.findings
        report.verifier = result.stats
        progress(
            "verify",
            f"Verified {result.stats.checked} claims against evidence: "
            f"{result.stats.passed} passed, {result.stats.dropped} dropped",
        )

        verdict = None
        if agent_out is not None:
            verdict = writer.verdict_from(
                agent_out, overall_level(result.ratings), evidence, fallback.LIMITATIONS
            )
        report.verdict = verdict or fallback.build_verdict(evidence, result.ratings)

        report.evidence_sha256 = hashlib.sha256(
            json.dumps(evidence.model_dump(mode="json"), sort_keys=True).encode()
        ).hexdigest()
        report.versions = {
            "pipeline": settings.pipeline_version,
            "evidence_provider": settings.evidence_provider,
            "reasoner": reasoner,
            "model": llm.model_name() if use_agent else "",
        }

        if req.lang != "en" and use_agent:
            progress("translate", "Translating the report")
            try:
                report.translations[req.lang] = translate.translate(report, req.lang)
            except Exception:
                log.exception("translation failed; report stays in English")

        report.status = "partial" if evidence.unavailable else "done"
        progress("done", "Report ready")
    except Exception as exc:  # never leave a report hanging in a running state
        log.exception("report %s failed", report.id)
        report.status = "error"
        report.error = "Something went wrong while analysing this location. Please try again."
        progress("error", type(exc).__name__)
    return report
