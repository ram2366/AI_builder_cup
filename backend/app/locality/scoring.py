"""Deterministic scoring engine for locality liveability.

Calculates transparent, auditable 0-100 scores across 4 sub-indices from measured distances and
counts of real nearby places. Opinions (community sentiment) are shown separately and never scored.
"""

from typing import Literal
from app.schemas import AmenitySummary, SubIndexScore

Status = Literal["excellent", "good", "moderate", "poor"]


def _status(score: int) -> Status:
    if score >= 80:
        return "excellent"
    if score >= 65:
        return "good"
    if score >= 45:
        return "moderate"
    return "poor"


def _n(count: int) -> str:
    # Google Places returns at most 20 per category.
    return "20+" if count >= 20 else str(count)


def _near(p, what: str) -> str:
    return f"{p.distance_m} m ({p.name})" if p else f"no {what} found within the search radius"


def calculate_scores(amenities: AmenitySummary) -> tuple[int, dict[str, SubIndexScore]]:
    # 1. Daily Essentials (Weight: 25%)
    g_dist = amenities.nearest_grocery.distance_m if amenities.nearest_grocery else 3000
    if g_dist <= 400:
        g_score = 100
    elif g_dist <= 800:
        g_score = 82
    elif g_dist <= 1500:
        g_score = 60
    elif g_dist <= 2500:
        g_score = 40
    else:
        g_score = 20

    h_dist = amenities.nearest_hospital.distance_m if amenities.nearest_hospital else 3500
    if h_dist <= 500:
        h_score = 100
    elif h_dist <= 1200:
        h_score = 80
    elif h_dist <= 2500:
        h_score = 55
    else:
        h_score = 25
    essentials_score = round(0.55 * g_score + 0.45 * h_score)

    # 2. Transit & Connectivity (Weight: 25%)
    if amenities.nearest_metro:
        m_dist = amenities.nearest_metro.distance_m
        if m_dist <= 800:
            m_score = 100
        elif m_dist <= 1500:
            m_score = 85
        elif m_dist <= 2500:
            m_score = 65
        elif m_dist <= 4000:
            m_score = 45
        else:
            m_score = 25
    else:
        m_score = 40  # baseline if no metro line in area

    b_dist = amenities.nearest_bus.distance_m if amenities.nearest_bus else 1500
    if b_dist <= 300:
        b_score = 100
    elif b_dist <= 600:
        b_score = 80
    elif b_dist <= 1200:
        b_score = 60
    else:
        b_score = 30
    transit_score = round(0.65 * m_score + 0.35 * b_score)

    # 3. Education & Childcare (Weight: 20%)
    s_dist = amenities.nearest_school.distance_m if amenities.nearest_school else 3000
    if s_dist <= 500:
        s_dist_score = 100
    elif s_dist <= 1200:
        s_dist_score = 80
    elif s_dist <= 2000:
        s_dist_score = 60
    else:
        s_dist_score = 35

    s_count = amenities.counts_by_category.get("education", 0)
    if s_count >= 5:
        s_cnt_score = 100
    elif s_count >= 3:
        s_cnt_score = 80
    elif s_count >= 1:
        s_cnt_score = 60
    else:
        s_cnt_score = 30
    education_score = round(0.5 * s_dist_score + 0.5 * s_cnt_score)

    # 4. Dining & Social Vibe (Weight: 15%)
    social_cnt = amenities.counts_by_category.get("social", 0)
    if social_cnt >= 15:
        soc_score = 100
    elif social_cnt >= 8:
        soc_score = 85
    elif social_cnt >= 4:
        soc_score = 65
    elif social_cnt >= 1:
        soc_score = 45
    else:
        soc_score = 25

    green_cnt = amenities.counts_by_category.get("green", 0)
    if green_cnt >= 3:
        grn_score = 100
    elif green_cnt >= 1:
        grn_score = 75
    else:
        grn_score = 40
    social_score = round(0.65 * soc_score + 0.35 * grn_score)


    # Compile Sub-Indices
    sub_indices: dict[str, SubIndexScore] = {
        "essentials": SubIndexScore(
            name="Daily Essentials & Health",
            score=essentials_score,
            weight=0.30,
            status=_status(essentials_score),
            summary=(
                f"Nearest grocery: {_near(amenities.nearest_grocery, 'grocery')}. "
                f"Nearest healthcare: {_near(amenities.nearest_hospital, 'clinic or hospital')}."
            ),
        ),
        "transit": SubIndexScore(
            name="Transit & Connectivity",
            score=transit_score,
            weight=0.30,
            status=_status(transit_score),
            summary=(
                f"Nearest metro: {_near(amenities.nearest_metro, 'metro station')}. "
                f"Nearest bus stop: {_near(amenities.nearest_bus, 'bus stop')}."
            ),
        ),
        "education": SubIndexScore(
            name="Schools & Childcare",
            score=education_score,
            weight=0.20,
            status=_status(education_score),
            summary=f"{_n(s_count)} schools and preschools found; nearest: {_near(amenities.nearest_school, 'school')}.",
        ),
        "social": SubIndexScore(
            name="Dining, Cafes & Parks",
            score=social_score,
            weight=0.20,
            status=_status(social_score),
            summary=f"{_n(social_cnt)} restaurants and cafes and {_n(green_cnt)} parks found in the area.",
        ),
    }

    # Overall Weighted Score
    overall = round(0.30 * essentials_score + 0.30 * transit_score + 0.20 * education_score + 0.20 * social_score)
    overall = max(0, min(100, overall))

    return overall, sub_indices
