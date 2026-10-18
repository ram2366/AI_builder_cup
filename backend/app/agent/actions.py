"""Action kit: turns a report into a site-visit checklist, questions for the builder and a
share message. Gemini drafts it; every item must cite valid evidence and pass the number and
policy checks, otherwise the template version is used."""

import json
import logging

from pydantic import BaseModel

from app.agent import llm
from app.agent.prompts import POLICY
from app.agent.verifier import resolve, text_issues
from app.schemas import ActionItem, ActionKit, Report

log = logging.getLogger(__name__)

SYSTEM = f"""
You turn a SAMPAAA land-risk report into practical next steps for a home or plot buyer in India.
Write:
- checklist: 4-6 things to do or look for on a site visit, specific to THIS plot's evidence
  (e.g. visit after heavy rain, check which side the drain is, compare plot level with the road);
- builder_questions: 3-5 polite but pointed questions to ask the developer, especially about anything
  the evidence contradicts or flags (filled water body, flooding, drainage, approvals for lake buffers);
- share_text: a short WhatsApp message (max 60 words) summarising the result for family, no emojis.
Each item has a short "why" that cites the evidence, and evidence_refs with the exact evidence paths.

{POLICY}
""".strip()


class _Draft(BaseModel):
    checklist: list[ActionItem]
    builder_questions: list[ActionItem]
    share_text: str


def _valid(item: ActionItem, report: Report) -> bool:
    assert report.evidence is not None
    ev = report.evidence.model_dump(mode="json")
    if item.evidence_refs and not all(resolve(ev, r)[0] for r in item.evidence_refs):
        return False
    refs = item.evidence_refs or None
    return not text_issues(item.text, report.evidence, refs) and not text_issues(item.why, report.evidence, refs)


def build(report: Report, use_gemini: bool) -> ActionKit:
    if use_gemini:
        try:
            ctx = (
                f"Place: {report.location.label or 'unnamed plot'}\n"
                f"Ratings: {json.dumps({d: r.level for d, r in report.ratings.items()})}\n"
                f"Findings: {json.dumps([f.claim for f in report.findings])}\n"
                f"Evidence pack: {json.dumps(report.evidence.model_dump(mode='json', exclude={'images'}))}"
            )
            d = llm.generate_json(_Draft, [ctx], SYSTEM)
            checklist = [i for i in d.checklist if _valid(i, report)][:6]
            questions = [i for i in d.builder_questions if _valid(i, report)][:5]
            share_ok = not text_issues(d.share_text, report.evidence)
            if len(checklist) >= 3 and len(questions) >= 2 and share_ok:
                return ActionKit(checklist=checklist, builder_questions=questions,
                                 share_text=d.share_text.strip(), generated_by="gemini")
            log.info("action kit failed checks; using template")
        except Exception:
            log.exception("action kit generation failed; using template")
    return template(report)


def template(report: Report) -> ActionKit:
    r = {d: x.level for d, x in report.ratings.items()}
    bad = lambda d: r.get(d) in ("high", "elevated")  # noqa: E731
    checklist: list[ActionItem] = []
    questions: list[ActionItem] = []

    if bad("flood") or bad("water_body"):
        checklist.append(ActionItem(text="Visit during or within a day of heavy rain.",
                                    why="Satellite records show water here in past monsoons.", evidence_refs=["monsoon.seen"]))
        checklist.append(ActionItem(text="Look for water stains on compound walls and raised plinths in nearby houses.",
                                    why="These are local signs of repeated waterlogging."))
        questions.append(ActionItem(text="Has this layout or plot ever flooded or been waterlogged? Can you share the drainage plan?",
                                    why="Flooding was recorded in the area.", evidence_refs=["monsoon.seen"]))
    if bad("water_body"):
        questions.append(ActionItem(text="Was any part of this layout a lake, tank or drain? How was it filled and compacted?",
                                    why="Water history shows this spot lost water that used to be here.", evidence_refs=["jrc.transition_core"]))
        questions.append(ActionItem(text="Do approvals confirm the plot is outside lake and drain buffer zones?",
                                    why="Former water bodies often have protected buffer zones."))
    if bad("terrain"):
        checklist.append(ActionItem(text="Compare the plot level with the road and the neighbouring plots.",
                                    why="The plot is low-lying compared with its surroundings.", evidence_refs=["terrain.hand_m"]))
    if bad("green"):
        checklist.append(ActionItem(text="Check the approved layout plan for parks and open spaces.",
                                    why="Green cover in the area has dropped sharply."))
    checklist.append(ActionItem(text="Ask neighbours and local shops what happens in a heavy monsoon.",
                                why="Local memory catches what satellites can miss."))
    checklist.append(ActionItem(text="Verify title, encumbrance certificate and RERA registration.",
                                why="SAMPAAA does not check legal title."))
    questions.append(ActionItem(text="Which stormwater drain does this layout connect to, and who maintains it?",
                                why="Drainage decides how fast water clears after rain."))

    v = report.verdict
    place = report.location.label or "this plot"
    share = f"SAMPAAA check for {place}: {v.headline if v else 'report ready'}. Overall physical risk: {(v.overall if v else 'n/a').upper()}. Full evidence: "
    return ActionKit(checklist=checklist[:6], builder_questions=questions[:5], share_text=share, generated_by="template")
