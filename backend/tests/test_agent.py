"""Agent paths with a fake Gemini: the pipeline must accept good output, repair or drop bad output,
and fall back to templates when the model fails."""

import pytest

from app.agent import brochure, llm, qa, writer
from app.agent import investigator as inv_mod
from app.config import get_settings
from app.pipeline import new_report, run_report
from app.schemas import AskResponse, ClaimCheck, ReportRequest

REQ = ReportRequest(lat=12.9505, lng=77.7005, label="Test layout, Bengaluru", report_id="agent-1")

GOOD = writer.WriterOutput(
    findings=[
        writer.FindingDraft(dimension="water_body", claim="Water was detected on the plot in 46% of observations.",
                            evidence_refs=["jrc.occurrence_core_pct"]),
        writer.FindingDraft(dimension="flood", claim="Radar showed 18% of the area under water in September 2022.",
                            evidence_refs=["s1.flooded_fraction_aoi", "s1.event"]),
        writer.FindingDraft(dimension="flood", claim="Monsoon water was seen in 4 of 9 monsoons.",
                            evidence_refs=["monsoon.seen", "monsoon.observed_years"]),
    ],
    headline="This plot sits on part of a former seasonal lake",
    summary="Satellite records show water here for years before it was filled and built on.",
    check_next=["Visit after heavy rain."],
)
BAD = writer.WriterOutput(
    findings=[writer.FindingDraft(dimension="flood", claim="It flooded 9 times and will flood again.",
                                  evidence_refs=["monsoon.seen"])],
    headline="Risky", summary="Bad.", check_next=[],
)


@pytest.fixture
def agent_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "use_agent", True)
    monkeypatch.setattr(get_settings(), "gemini_api_key", "fake")
    # The investigator "decides" to run a radar check, like the real agent would.
    def fake_run(self):
        self.tools()[1]("2022-06-01", "2022-11-30")
        return "Checked radar for the 2022 monsoon: 18% flooded."
    monkeypatch.setattr(inv_mod.Investigation, "run", fake_run)


def test_agent_findings_used_when_they_verify(agent_on, monkeypatch):
    monkeypatch.setattr(llm, "generate_json", lambda schema, *a, **k: GOOD)
    rep = run_report(REQ, new_report(REQ))
    assert rep.status == "done"
    assert rep.versions["reasoner"] == "gemini-agent"
    assert rep.evidence.s1.flooded_fraction_aoi == 0.18  # tool result landed in the evidence
    assert len(rep.findings) == 3 and rep.verifier.dropped == 0
    assert rep.verdict.headline == GOOD.headline
    assert any("radar" in p.msg.lower() for p in rep.progress)


def test_bad_agent_output_is_repaired_or_replaced(agent_on, monkeypatch):
    outputs = iter([BAD, writer.FixOutput(findings=BAD.findings)])
    monkeypatch.setattr(llm, "generate_json", lambda schema, *a, **k: next(outputs))
    rep = run_report(REQ, new_report(REQ.model_copy(update={"report_id": "agent-2"})))
    assert rep.status == "done"
    assert rep.versions["reasoner"] == "gemini-agent+template-findings"
    assert all("will flood" not in f.claim for f in rep.findings)
    assert rep.verifier.dropped == 0
    assert rep.verdict.headline != "Risky"


def test_model_crash_falls_back_to_templates(agent_on, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("quota")
    monkeypatch.setattr(llm, "generate_json", boom)
    rep = run_report(REQ, new_report(REQ.model_copy(update={"report_id": "agent-3"})))
    assert rep.status == "done" and len(rep.findings) >= 3


def _done_report():
    return run_report(REQ, new_report(REQ.model_copy(update={"report_id": "agent-qa"})))


def test_qa_rejects_unverified_numbers(monkeypatch):
    rep = _done_report()
    answers = iter([AskResponse(answer="It flooded in 7 years.", evidence_refs=["monsoon.seen"])] * 2)
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: next(answers))
    out = qa.answer(rep, "Does it flood?", "en")
    assert "couldn't answer" in out.answer


def test_qa_accepts_grounded_answer(monkeypatch):
    rep = _done_report()
    good = AskResponse(answer="Yes, water was seen in 4 of 9 monsoons.", evidence_refs=["monsoon.seen", "monsoon.observed_years"])
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: good)
    assert qa.answer(rep, "Does it flood?", "en") == good


def test_brochure_unbacked_verdict_downgraded(monkeypatch):
    rep = _done_report()
    extracted = brochure._Extracted(claims=[brochure._Claim(text="Flood-free location", category="flood")])
    judged = brochure._Judged(claims=[
        ClaimCheck(text="Flood-free location", category="flood", verdict="contradicted",
                   reason="Water seen in 6 of 9 monsoons.", evidence_refs=["monsoon.seen"]),
    ])
    outs = iter([extracted, judged])
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: next(outs))
    res = brochure.check(rep, b"img", "image/png")
    assert res[0].verdict == "not_verifiable"


def test_circuit_breaker_skips_overloaded_models(monkeypatch):
    from google.genai import errors
    llm._down_until.clear()
    calls = []

    def busy(model):
        calls.append(model)
        raise errors.ServerError(503, {"error": {"code": 503, "message": "busy", "status": "UNAVAILABLE"}})

    with pytest.raises(errors.APIError):
        llm.with_fallback(busy)
    assert calls == llm.models()
    with pytest.raises(llm.ModelsUnavailable):  # second call fails instantly, no network
        llm.with_fallback(busy)
    assert len(calls) == len(llm.models())
    llm._down_until.clear()


def test_failed_agent_does_not_duplicate_drilldowns(monkeypatch):
    monkeypatch.setattr(get_settings(), "use_agent", True)
    monkeypatch.setattr(get_settings(), "gemini_api_key", "fake")

    def partial_then_timeout(self):
        self.tools()[1]("2022-06-01", "2022-11-30")
        self.tools()[3]()
        raise TimeoutError

    monkeypatch.setattr(inv_mod.Investigation, "run", partial_then_timeout)
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("quota")))
    rep = run_report(REQ, new_report(REQ.model_copy(update={"report_id": "agent-dup"})))
    assert len(rep.evidence.news) == 2
    assert sum(p.step == "drilldown" for p in rep.progress) == 0
