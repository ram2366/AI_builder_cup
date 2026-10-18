"""Compare 2-3 finished reports: rules pick the safest plot; Gemini (optionally) explains why in one
or two sentences, using only numbers found in the compared reports."""

import json
import logging

from pydantic import BaseModel

from app.agent import llm
from app.agent.prompts import POLICY
from app.agent.verifier import number_issues, policy_issues
from app.schemas import LEVEL_ORDER, CompareResponse, Report

log = logging.getLogger(__name__)

SYSTEM = f"""
Compare these plots for a buyer in at most two sentences (max 55 words). Say which plot has the lowest
physical risk and the one or two pieces of evidence that make the difference. Refer to plots by their
place names. Use only numbers present in the data.

{POLICY}
""".strip()


class _Out(BaseModel):
    summary: str


def _score(r: Report) -> tuple:
    levels = [LEVEL_ORDER.index(x.level) for d, x in r.ratings.items() if d != "rain"]
    hand = r.evidence.terrain.hand_m if r.evidence and r.evidence.terrain else 0
    return (max(levels, default=0), sum(levels), -hand)


def _name(r: Report) -> str:
    return r.location.label or f"plot at {r.location.lat:.4f}, {r.location.lng:.4f}"


def compare(reports: list[Report], use_gemini: bool) -> CompareResponse:
    ranked = sorted(reports, key=_score)
    best = ranked[0]
    tie = _score(best) == _score(ranked[1])

    if use_gemini:
        try:
            data = [
                {
                    "place": _name(r),
                    "overall": r.verdict.overall if r.verdict else None,
                    "ratings": {d: x.level for d, x in r.ratings.items()},
                    "findings": [f.claim for f in r.findings],
                }
                for r in reports
            ]
            out = llm.generate_json(_Out, [json.dumps(data)], SYSTEM)
            pool = [r.evidence.model_dump(mode="json") for r in reports if r.evidence]
            if not number_issues(out.summary, pool) and not policy_issues(out.summary):
                return CompareResponse(summary=out.summary.strip(), best_id=None if tie else best.id, generated_by="gemini")
        except Exception:
            log.exception("compare summary failed; using template")

    if tie:
        return CompareResponse(summary="These plots have a similar physical risk profile. Compare the findings below.", best_id=None)
    others = ", ".join(f"{_name(r)} ({r.verdict.overall if r.verdict else 'n/a'})" for r in ranked[1:])
    return CompareResponse(
        summary=f"{_name(best)} has the lowest physical risk ({best.verdict.overall if best.verdict else 'n/a'}), "
        f"compared with {others}.",
        best_id=best.id,
    )
