import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRIORITIES,
  personalLocalityScore,
  type PrioritySettings,
} from "../src/lib/localityPriorities.ts";
import type { SubIndexScore } from "../src/lib/types.ts";

function subIndex(score: number, weight: number): SubIndexScore {
  return { name: "Test", score, weight, status: "good", summary: "Test" };
}

const subIndices = {
  essentials: subIndex(80, 0.3),
  transit: subIndex(60, 0.3),
  education: subIndex(90, 0.2),
  social: subIndex(70, 0.2),
};

test("normal priorities preserve the existing default score formula", () => {
  const existingScore = Math.round(80 * 0.3 + 60 * 0.3 + 90 * 0.2 + 70 * 0.2);
  assert.equal(personalLocalityScore(subIndices, DEFAULT_PRIORITIES), existingScore);
  assert.equal(personalLocalityScore(subIndices, DEFAULT_PRIORITIES, 75), 75);
});

test("a high priority changes only the client-side weighted score", () => {
  const settings: PrioritySettings = { ...DEFAULT_PRIORITIES, schools: "high" };
  assert.equal(personalLocalityScore(subIndices, settings), 77);
  assert.deepEqual(DEFAULT_PRIORITIES, {
    commute: "normal",
    schools: "normal",
    essentials: "normal",
    green_air: "normal",
    social: "normal",
  });
});
