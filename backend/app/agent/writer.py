"""Turns evidence + investigation notes into cited findings and a verdict (structured output),
with one automatic repair pass for anything the verifier rejects."""

import json
import logging

from pydantic import BaseModel

from app.agent import llm, prompts
from app.agent.verifier import VerifyResult, text_issues, verify
from app.schemas import (
    Dimension,
    DimensionRating,
    Evidence,
    Finding,
    Level,
    RatingChange,
    Verdict,
)

log = logging.getLogger(__name__)

_SEVERITY = {"high": "concern", "elevated": "concern", "moderate": "watch", "low": "info"}


class RatingChangeDraft(BaseModel):
    dimension: Dimension
    from_level: Level
    to: Level
    because: list[str]


class FindingDraft(BaseModel):
    dimension: Dimension
    claim: str
    evidence_refs: list[str]
    rating_change: RatingChangeDraft | None = None


class WriterOutput(BaseModel):
    findings: list[FindingDraft]
    headline: str
    summary: str
    check_next: list[str]


class FixOutput(BaseModel):
    findings: list[FindingDraft]


def _context(evidence: Evidence, ratings: dict[Dimension, DimensionRating], notes: str) -> str:
    ev = evidence.model_dump(mode="json", exclude={"images"})
    return (
        f"Baseline ratings:\n{json.dumps({d: r.model_dump() for d, r in ratings.items()})}\n\n"
        f"Evidence pack:\n{json.dumps(ev)}\n\n"
        f"Investigator notes:\n{notes or '(none)'}"
    )


def to_findings(drafts: list[FindingDraft], ratings: dict[Dimension, DimensionRating]) -> list[Finding]:
    out = []
    for i, d in enumerate(drafts, start=1):
        level = ratings[d.dimension].level if d.dimension in ratings else "low"
        rc = None
        if d.rating_change:
            rc = RatingChange(
                dimension=d.rating_change.dimension,
                **{"from": d.rating_change.from_level},
                to=d.rating_change.to,
                because=d.rating_change.because,
            )
        out.append(
            Finding(
                id=f"f{i}",
                dimension=d.dimension,
                claim=d.claim.strip(),
                evidence_refs=d.evidence_refs,
                severity=_SEVERITY[level],  # type: ignore[arg-type]
                rating_change=rc,
            )
        )
    return out


def write(
    evidence: Evidence, ratings: dict[Dimension, DimensionRating], notes: str
) -> tuple[VerifyResult, WriterOutput, bool]:
    """Returns the verified findings, the raw writer output (for the verdict) and whether a fix pass ran."""
    ctx = _context(evidence, ratings, notes)
    out = llm.generate_json(WriterOutput, [ctx], prompts.WRITER)
    result = verify(to_findings(out.findings, ratings), evidence, ratings)
    if result.stats.issues:
        log.info("writer first-pass issues: %s", result.stats.issues)
    if result.stats.dropped == 0:
        return result, out, False

    fix_prompt = (
        f"{ctx}\n\nYour findings:\n{json.dumps([f.model_dump() for f in out.findings])}\n\n"
        "Verification issues:\n" + "\n".join(result.stats.issues)
    )
    try:
        fixed = llm.generate_json(FixOutput, [fix_prompt], prompts.WRITER + "\n\n" + prompts.FIXER)
    except Exception:
        log.warning("fix pass failed; keeping the %d findings that already passed", result.stats.passed)
        return result, out, False
    second = verify(to_findings(fixed.findings, ratings), evidence, ratings)
    second.stats.fixed = max(0, second.stats.passed - result.stats.passed)
    second.stats.issues = result.stats.issues + second.stats.issues
    return second, out, True


def verdict_from(
    out: WriterOutput, overall: Level, evidence: Evidence, limitations: list[str]
) -> Verdict | None:
    """Accept the model's verdict text only if it passes the same number and policy checks."""
    texts = [out.headline, out.summary, *out.check_next]
    if any(text_issues(t, evidence) for t in texts):
        return None
    return Verdict(
        overall=overall,
        headline=out.headline.strip(),
        summary=out.summary.strip(),
        check_next=[c.strip() for c in out.check_next if c.strip()][:5]
        + ["Verify title, approvals and RERA registration through official records."],
        limitations=limitations,
    )
