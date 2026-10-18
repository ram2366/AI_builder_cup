import assert from "node:assert/strict";
import test from "node:test";
import { contextualAskSuggestions } from "../src/lib/askSuggestions.ts";
import type { Report } from "../src/lib/types.ts";

const rating = (level: "low" | "moderate" | "elevated" | "high") => ({ level, confidence: "high" as const, sources: [] });

test("uses the two most salient verified ratings", () => {
  const report = {
    ratings: { flood: rating("high"), terrain: rating("elevated"), water_body: rating("low") },
    findings: [],
    verdict: { overall: "high", headline: "", summary: "", check_next: [], limitations: [] },
  } satisfies Pick<Report, "ratings" | "findings" | "verdict">;
  assert.deepEqual(contextualAskSuggestions(report), ["Why is the flood risk high?", "Why is the terrain risk elevated?"]);
});

test("low-risk reports still get two honest context prompts", () => {
  const report = {
    ratings: { flood: rating("low") },
    findings: [],
    verdict: { overall: "low", headline: "", summary: "", check_next: [], limitations: [] },
  } satisfies Pick<Report, "ratings" | "findings" | "verdict">;
  assert.deepEqual(contextualAskSuggestions(report), ["Why is the overall risk low?", "Which evidence matters most for this plot?"]);
});
