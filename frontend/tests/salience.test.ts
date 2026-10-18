import assert from "node:assert/strict";
import test from "node:test";
import { hasWaterSignal, rankSalientDimensions, salienceScore, strongestChangeSignal } from "../src/lib/salience.ts";
import type { Evidence, Finding, Report } from "../src/lib/types.ts";

const rating = (level: "low" | "moderate" | "elevated" | "high", confidence: "low" | "medium" | "high") => ({ level, confidence, sources: [] });
const finding = (overrides: Partial<Finding>): Finding => ({
  id: "f",
  dimension: "water_body",
  claim: "Verified claim",
  evidence_refs: ["jrc.occurrence_core_pct"],
  severity: "info",
  confidence: "high",
  ...overrides,
});
const report = (ratings: Report["ratings"], findings: Finding[] = []) => ({ ratings, findings });
const evidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  landcover: null,
  land_health: null,
  water_years: null,
  water_months: null,
  jrc: null,
  monsoon: null,
  terrain: null,
  s1: null,
  images: [],
  vision: [],
  rain: null,
  embedding: null,
  news: [],
  unavailable: [],
  ...overrides,
});

test("salience applies confidence and both novelty bonuses", () => {
  const findings = [finding({ severity: "concern", rating_change: { dimension: "water_body", from: "moderate", to: "elevated", because: ["jrc.transition_core"] } })];
  assert.equal(salienceScore("water_body", rating("elevated", "medium"), findings), 3.2);
});

test("ranking is deterministic, capped at three, and suppresses regional rain", () => {
  const result = rankSalientDimensions(report({
    water_body: rating("elevated", "high"),
    flood: rating("elevated", "high"),
    terrain: rating("elevated", "high"),
    land_health: rating("elevated", "high"),
    green: rating("elevated", "high"),
    rain: rating("high", "high"),
  }));
  assert.deepEqual(result, ["water_body", "flood", "terrain"]);
});

test("rain appears only when it is the sole non-low dimension", () => {
  assert.deepEqual(rankSalientDimensions(report({ water_body: rating("low", "high"), rain: rating("moderate", "low") })), ["rain"]);
  assert.deepEqual(rankSalientDimensions(report({ water_body: rating("low", "high"), rain: rating("low", "high") })), []);
});

test("water signal uses the two-percent threshold or observed monsoon water", () => {
  assert.equal(hasWaterSignal(evidence({ water_years: { source: "JRC", resolution_m: 30, by_year: { "2021": 0.019 } } })), false);
  assert.equal(hasWaterSignal(evidence({ water_years: { source: "JRC", resolution_m: 30, by_year: { "2021": 0.02 } } })), true);
  assert.equal(hasWaterSignal(evidence({ monsoon: { source: "DW", resolution_m: 10, seen: [2024], observed_years: 1, obs_per_year: { "2024": 5 } } })), true);
  assert.equal(hasWaterSignal(evidence({
    landcover: {
      source: "DW probabilities",
      resolution_m: 10,
      by_year: { "2025": { water: 0.03, trees: 0, grass: 0, flooded_vegetation: 0, crops: 0, shrub_and_scrub: 0, built: 0.97, bare: 0, snow_and_ice: 0 } },
      green_by_year: { "2025": 0 },
    },
  })), false);
});

test("strongest change compares meaningful water, built and green changes", () => {
  const ev = evidence({
    water_years: { source: "JRC", resolution_m: 30, by_year: { "2020": 0.2, "2021": 0.01 } },
    landcover: {
      source: "DW",
      resolution_m: 10,
      by_year: {
        "2020": { water: 0, trees: 0.3, grass: 0.2, flooded_vegetation: 0, crops: 0, shrub_and_scrub: 0, built: 0.1, bare: 0.4, snow_and_ice: 0 },
        "2025": { water: 0, trees: 0.2, grass: 0.2, flooded_vegetation: 0, crops: 0, shrub_and_scrub: 0, built: 0.18, bare: 0.42, snow_and_ice: 0 },
      },
      green_by_year: { "2020": 0.5, "2025": 0.4 },
    },
  });
  assert.equal(strongestChangeSignal(ev), "water");
});
