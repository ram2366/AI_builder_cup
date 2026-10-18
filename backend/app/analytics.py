"""Small deterministic analytics used to turn satellite time series into evidence."""

from __future__ import annotations

import math
from collections import Counter
from statistics import median

from app.schemas import TrendResult


def sen_mann_kendall(points: list[tuple[int, float]]) -> TrendResult | None:
    """Return Sen's slope and the two-sided Mann–Kendall p-value.

    The p-value uses the normal approximation with continuity and tie correction. A trend is only
    labelled significant with six or more annual readings, as required by the product spec.
    """

    ordered = sorted(points)
    n = len(ordered)
    if n < 2:
        return None

    slopes: list[float] = []
    score = 0
    for i, (year_i, value_i) in enumerate(ordered[:-1]):
        for year_j, value_j in ordered[i + 1 :]:
            if year_j == year_i:
                continue
            slopes.append((value_j - value_i) / (year_j - year_i))
            score += (value_j > value_i) - (value_j < value_i)

    if not slopes:
        return None

    ties = Counter(value for _, value in ordered)
    tie_term = sum(size * (size - 1) * (2 * size + 5) for size in ties.values() if size > 1)
    variance = (n * (n - 1) * (2 * n + 5) - tie_term) / 18
    if variance <= 0:
        p_value = 1.0
    else:
        z = (score - 1) / math.sqrt(variance) if score > 0 else (score + 1) / math.sqrt(variance) if score < 0 else 0.0
        p_value = math.erfc(abs(z) / math.sqrt(2))

    return TrendResult(
        slope_per_year=round(median(slopes), 4),
        p_value=round(p_value, 4),
        significant=n >= 6 and p_value < 0.05,
        n_years=n,
    )
