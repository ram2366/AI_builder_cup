"""Report translation (Hindi, Kannada). Numbers must survive translation unchanged; any finding whose
numbers change falls back to English."""

import re

from pydantic import BaseModel

from app.agent import llm, prompts
from app.schemas import Lang, Report, Translation

LANGUAGE_NAME: dict[Lang, str] = {"en": "English", "hi": "Hindi", "kn": "Kannada"}
_NUM = re.compile(r"\d+(?:\.\d+)?")


class _Item(BaseModel):
    id: str
    text: str


class _Draft(BaseModel):
    headline: str
    summary: str
    check_next: list[str]
    findings: list[_Item]


def _nums(text: str) -> list[str]:
    return sorted(_NUM.findall(text))


def translate(report: Report, lang: Lang) -> Translation:
    assert report.verdict is not None
    v = report.verdict
    src = _Draft(
        headline=v.headline,
        summary=v.summary,
        check_next=v.check_next,
        findings=[_Item(id=f.id, text=f.claim) for f in report.findings],
    )
    out = llm.generate_json(
        _Draft,
        [src.model_dump_json()],
        prompts.TRANSLATE.format(language=LANGUAGE_NAME[lang]),
    )
    by_id = {i.id: i.text for i in out.findings}
    findings = {}
    for f in report.findings:
        t = by_id.get(f.id, "")
        findings[f.id] = t if t and _nums(t) == _nums(f.claim) else f.claim

    def keep(src_text: str, new: str) -> str:
        return new if new and _nums(new) == _nums(src_text) else src_text

    check_next = out.check_next if len(out.check_next) == len(v.check_next) else v.check_next
    return Translation(
        headline=keep(v.headline, out.headline),
        summary=keep(v.summary, out.summary),
        check_next=[keep(a, b) for a, b in zip(v.check_next, check_next)],
        findings=findings,
    )
