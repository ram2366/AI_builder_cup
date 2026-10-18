import assert from "node:assert/strict";
import test from "node:test";
import { LAYERS, layerEvidenceDetails } from "../src/lib/layers.ts";
import type { Evidence } from "../src/lib/types.ts";

const evidence = (): Evidence => ({
  landcover: null,
  land_health: null,
  water_years: null,
  water_months: null,
  jrc: { source: "JRC Global Surface Water", resolution_m: 30, period: "1984–2021", occurrence_core_pct: 0, occurrence_area_pct: 0, transition_core: null, years_water_core: [] },
  monsoon: null,
  terrain: null,
  buildings: null,
  historic_floods: null,
  flood_hazard: null,
  s1: null,
  images: [],
  vision: [],
  rain: null,
  embedding: null,
  news: [],
  unavailable: [],
});

test("layer legends use the backend map-layer colour ramps", () => {
  assert.deepEqual(LAYERS.find((layer) => layer.id === "water")?.ramp, ["#9ecbff", "#3b82f6", "#1e3a8a"]);
  assert.deepEqual(LAYERS.find((layer) => layer.id === "lowlying")?.ramp, ["#f59e0b", "#fcd34d"]);
  assert.deepEqual(LAYERS.find((layer) => layer.id === "lst")?.ramp, ["#396ab1", "#76c6c3", "#f4d35e", "#ee964b", "#be3f57"]);
});

test("disabled layer detail keeps observed metadata and gives an honest reason", () => {
  const details = layerEvidenceDetails("water", evidence());
  assert.equal(details.source, "JRC Global Surface Water");
  assert.equal(details.resolution, "30 m");
  assert.equal(details.period, "1984–2021");
  assert.match(details.unavailableReason ?? "", /No water signal/);
});
