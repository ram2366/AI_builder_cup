import { rankSalientDimensions } from "./salience";
import type { Dimension, Report } from "./types";

const QUESTION: Record<Dimension, (level: string) => string> = {
  water_body: (level) => `Why is the water-history risk ${level}?`,
  flood: (level) => `Why is the flood risk ${level}?`,
  terrain: (level) => `Why is the terrain risk ${level}?`,
  green: (level) => `Why is the land-change risk ${level}?`,
  land_health: (level) => `What is driving the ${level} land-health rating?`,
  rain: () => "How does the rainfall evidence affect this plot?",
};

/** Two report-specific prompts without inventing facts outside the verified ratings. */
export function contextualAskSuggestions(report: Pick<Report, "ratings" | "findings" | "verdict">): string[] {
  const questions = rankSalientDimensions(report)
    .slice(0, 2)
    .flatMap((dimension) => {
      const rating = report.ratings[dimension];
      return rating ? [QUESTION[dimension](rating.level)] : [];
    });

  if (questions.length < 2 && report.verdict) questions.push(`Why is the overall risk ${report.verdict.overall}?`);
  if (questions.length < 2) questions.push("Which evidence matters most for this plot?");
  if (questions.length < 2) questions.push("What should I verify during a site visit?");
  return [...new Set(questions)].slice(0, 2);
}
