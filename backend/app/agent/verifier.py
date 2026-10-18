"""Deterministic verifier: every finding must cite real evidence, and every number in a claim
must match a cited value. Findings that fail are dropped (the agent gets one chance to fix them
before this runs in the agent pipeline)."""

import re
from dataclasses import dataclass, field
from typing import Any

from app.rules import raise_one
from app.schemas import LEVEL_ORDER, Dimension, DimensionRating, Evidence, Finding, VerifierStats

_NUM = re.compile(r"(?<!\d)-?\d+(?:\.\d+)?")

# History-only, no guarantees, no legal claims. Applied to the canonical English claim text.
_BANNED = [
    (re.compile(r"\bwill\s+(?:\w+\s+){0,2}flood", re.I), "predicts the future"),
    (re.compile(r"\bflood[- ]?free\b", re.I), "guarantees no flooding"),
    (re.compile(r"\b(?:is|are|completely|totally|perfectly)\s+safe\b", re.I), "declares the land safe"),
    (re.compile(r"\bguarantee", re.I), "makes a guarantee"),
    (re.compile(r"\b(?:clear|legal|clean)\s+title\b|\bencumbrance", re.I), "comments on legal title"),
]

# Sections whose evidence can justify raising a rating above the rules baseline.
_CORROBORATING_SECTIONS = {
    "s1",
    "news",
    "vision",
    "monsoon",
    "historic_floods",
    "flood_hazard",
}


def resolve(evidence: dict[str, Any], ref: str) -> tuple[bool, Any]:
    """Resolve a dotted path like 'landcover.by_year.2016.water' or 'vision.0.year'."""
    cur: Any = evidence
    for part in ref.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return False, None
    return True, cur


def _collect_numbers(value: Any, out: list[float]) -> None:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        out.append(float(value))
    elif isinstance(value, str):
        out.extend(float(n) for n in _NUM.findall(value))
    elif isinstance(value, list):
        out.append(float(len(value)))
        for v in value:
            _collect_numbers(v, out)
    elif isinstance(value, dict):
        for k, v in value.items():
            if isinstance(k, str) and k.isdigit():
                out.append(float(k))  # year keys such as by_year["2016"]
            _collect_numbers(v, out)


def _matches(x: float, v: float) -> bool:
    candidates = [v, v * 100]  # fractions are often written as percentages
    for c in candidates:
        if abs(x - c) <= max(0.05 * abs(c), 0.5 if c >= 1 else 0.005):
            return True
    return False


def number_issues(claim: str, cited_values: list[Any]) -> list[str]:
    pool: list[float] = []
    for v in cited_values:
        _collect_numbers(v, pool)
    bad = [n for n in _NUM.findall(claim) if not any(_matches(float(n), p) for p in pool)]
    return [f"number {n} not found in cited evidence" for n in bad]


def policy_issues(text: str) -> list[str]:
    return [f"text {why}" for pattern, why in _BANNED if pattern.search(text)]


def text_issues(text: str, evidence: Evidence, refs: list[str] | None = None) -> list[str]:
    """Checks free text (verdict, answers, reasons). With refs, numbers must come from those values;
    without, from anywhere in the evidence pack."""
    ev = evidence.model_dump(mode="json")
    if refs is None:
        values: list[Any] = [ev]
    else:
        values = []
        for ref in refs:
            ok, val = resolve(ev, ref)
            if not ok:
                return [f"unknown evidence ref '{ref}'"]
            values += [val, *[int(p) for p in ref.split(".") if p.isdigit()]]
    return number_issues(text, values) + policy_issues(text)


@dataclass
class VerifyResult:
    findings: list[Finding]
    ratings: dict[Dimension, DimensionRating]
    stats: VerifierStats = field(default_factory=VerifierStats)


def verify(
    findings: list[Finding],
    evidence: Evidence,
    ratings: dict[Dimension, DimensionRating],
) -> VerifyResult:
    ev = evidence.model_dump(mode="json")
    stats = VerifierStats(checked=len(findings))
    kept: list[Finding] = []
    new_ratings = {d: r.model_copy() for d, r in ratings.items()}

    for f in findings:
        issues: list[str] = []
        if not f.evidence_refs:
            issues.append("no evidence cited")
        values = []
        for ref in f.evidence_refs:
            ok, val = resolve(ev, ref)
            if ok:
                values.append(val)
                # Numeric path segments (e.g. the year in "landcover.by_year.2016") are cited too.
                values += [int(p) for p in ref.split(".") if p.isdigit()]
            else:
                issues.append(f"unknown evidence ref '{ref}'")
        issues += number_issues(f.claim, values)
        for pattern, why in _BANNED:
            if pattern.search(f.claim):
                issues.append(f"claim {why}")

        if f.rating_change is not None:
            issues += _check_rating_change(f, ev, new_ratings)

        if issues:
            stats.dropped += 1
            stats.issues.append(f"{f.id}: " + "; ".join(issues))
            continue

        if f.dimension in new_ratings:
            f = f.model_copy(update={"confidence": new_ratings[f.dimension].confidence})
        if f.rating_change is not None:
            rc = f.rating_change
            new_ratings[rc.dimension] = new_ratings[rc.dimension].model_copy(update={"level": rc.to})
        stats.passed += 1
        kept.append(f)

    return VerifyResult(findings=kept, ratings=new_ratings, stats=stats)


def _check_rating_change(
    f: Finding, ev: dict[str, Any], ratings: dict[Dimension, DimensionRating]
) -> list[str]:
    rc = f.rating_change
    assert rc is not None
    issues = []
    current = ratings.get(rc.dimension)
    if current is None:
        return [f"rating change for unrated dimension {rc.dimension}"]
    if rc.dimension == "rain":
        issues.append("rain rating cannot be raised")
    if rc.from_level != current.level:
        issues.append(f"rating change 'from' {rc.from_level} != baseline {current.level}")
    if LEVEL_ORDER.index(rc.to) <= LEVEL_ORDER.index(current.level):
        issues.append("ratings can only be raised")
    elif rc.to != raise_one(current.level):
        issues.append("ratings can only be raised by one level")
    if not rc.because or not all(resolve(ev, r)[0] for r in rc.because):
        issues.append("rating change cites unknown evidence")
    elif not any(r.split(".")[0] in _CORROBORATING_SECTIONS for r in rc.because):
        issues.append("rating change needs corroborating evidence (radar, news, imagery or monsoon)")
    return issues
