import type { Dimension, DimensionRating, Evidence, Finding, Report } from "./types";

export const SALIENCE_ORDER: Dimension[] = ["water_body", "flood", "terrain", "land_health", "green", "rain"];

const LEVEL_WEIGHT = { high: 4, elevated: 3, moderate: 2, low: 0 } as const;
const CONFIDENCE_WEIGHT = { high: 1, medium: 0.8, low: 0.6 } as const;

export function salienceScore(dimension: Dimension, rating: DimensionRating, findings: Finding[]): number {
  const related = findings.filter((finding) => finding.dimension === dimension);
  const novelty = (related.some((finding) => finding.rating_change?.dimension === dimension) ? 0.5 : 0) +
    (related.some((finding) => finding.severity === "concern") ? 0.3 : 0);
  return LEVEL_WEIGHT[rating.level] * CONFIDENCE_WEIGHT[rating.confidence] + novelty;
}

export function rankSalientDimensions(report: Pick<Report, "ratings" | "findings">): Dimension[] {
  const scored = SALIENCE_ORDER.flatMap((dimension) => {
    const rating = report.ratings[dimension];
    return rating && salienceScore(dimension, rating, report.findings) >= 1.2
      ? [{ dimension, score: salienceScore(dimension, rating, report.findings) }]
      : [];
  }).sort((a, b) => b.score - a.score || SALIENCE_ORDER.indexOf(a.dimension) - SALIENCE_ORDER.indexOf(b.dimension));

  const nonRain = scored.filter(({ dimension }) => dimension !== "rain");
  if (nonRain.length) return nonRain.slice(0, 3).map(({ dimension }) => dimension);

  const rain = scored.find(({ dimension }) => dimension === "rain");
  const rainRating = report.ratings.rain;
  return rain && rainRating?.level !== "low" ? ["rain"] : [];
}

export function hasWaterSignal(evidence: Evidence): boolean {
  // Use observed water extent, not Dynamic World's soft class probabilities: a dry urban plot can
  // carry a few percent water probability without any pixel actually being classified as water.
  const shares = Object.values(evidence.water_years?.by_year ?? {});
  return Math.max(0, ...shares) >= 0.02 || (evidence.monsoon?.seen.length ?? 0) > 0;
}

export type ChangeSignal = "water" | "built" | "green" | "stable" | "unavailable";

/** Pick the largest meaningful percentage-point change; ties follow water, built, green. */
export function strongestChangeSignal(evidence: Evidence): ChangeSignal {
  const waterShares = [
    ...Object.entries(evidence.water_years?.by_year ?? {}),
    ...Object.entries(evidence.landcover?.by_year ?? {}).map(([year, cover]) => [year, cover.water + cover.flooded_vegetation] as const),
  ].sort(([a], [b]) => a.localeCompare(b));
  const latestWater = waterShares.at(-1)?.[1] ?? 0;
  const waterLoss = Math.max(0, ...waterShares.map(([, share]) => share)) - latestWater;

  const years = Object.keys(evidence.landcover?.by_year ?? {}).sort();
  if (!waterShares.length && years.length < 2) return "unavailable";

  let builtGrowth = 0;
  let greenLoss = 0;
  if (years.length >= 2 && evidence.landcover) {
    const first = evidence.landcover.comparison_windows?.baseline.mean ?? evidence.landcover.by_year[years[0]];
    const last = evidence.landcover.comparison_windows?.recent.mean ?? evidence.landcover.by_year[years[years.length - 1]];
    builtGrowth = last.built - first.built;
    const firstGreen = first.trees + first.grass + first.shrub_and_scrub;
    const lastGreen = last.trees + last.grass + last.shrub_and_scrub;
    greenLoss = firstGreen - lastGreen;
  }

  const candidates: { signal: Exclude<ChangeSignal, "stable" | "unavailable">; amount: number; threshold: number }[] = [
    { signal: "water", amount: waterLoss, threshold: 0.02 },
    { signal: "built", amount: builtGrowth, threshold: 0.05 },
    { signal: "green", amount: greenLoss, threshold: 0.05 },
  ];
  const strongest = candidates.filter(({ amount, threshold }) => amount >= threshold).sort((a, b) => b.amount - a.amount)[0];
  return strongest?.signal ?? "stable";
}
