"""Brochure Claim Checker: extract marketing claims, then judge each against the evidence.

Extraction and judging are separate calls, so text inside the brochure can never steer the judge."""

import json
from typing import Literal

from pydantic import BaseModel

from app.agent import llm, prompts
from app.agent.verifier import text_issues
from app.schemas import ClaimCheck, Report


class _Claim(BaseModel):
    text: str
    category: Literal["flood", "water_body", "green", "elevation", "other"]


class _Extracted(BaseModel):
    claims: list[_Claim]


class _Judged(BaseModel):
    claims: list[ClaimCheck]


def check(report: Report, data: bytes, mime: str) -> list[ClaimCheck]:
    assert report.evidence is not None
    extracted = llm.generate_json(
        _Extracted,
        [llm.image_part(data, mime), "Extract the claims from this brochure."],
        prompts.BROCHURE_EXTRACT,
    ).claims[:10]
    if not extracted:
        return []

    ctx = (
        f"Evidence pack:\n{json.dumps(report.evidence.model_dump(mode='json', exclude={'images'}))}\n\n"
        f"Ratings:\n{json.dumps({d: r.level for d, r in report.ratings.items()})}\n\n"
        f"Claims to judge:\n{json.dumps([c.model_dump() for c in extracted])}"
    )
    judged = llm.generate_json(_Judged, [ctx], prompts.BROCHURE_JUDGE).claims

    out = []
    for c in judged:
        if c.verdict != "not_verifiable" and (
            not c.evidence_refs or text_issues(c.reason, report.evidence, c.evidence_refs)
        ):
            c = c.model_copy(update={
                "verdict": "not_verifiable",
                "reason": "SAMPAAA could not verify this claim automatically against the evidence.",
                "evidence_refs": [],
            })
        out.append(c)
    return out
