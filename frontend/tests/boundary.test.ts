import assert from "node:assert/strict";
import test from "node:test";
import { boundaryCenter, boundaryDraftMetrics, boundaryMetrics, validateBoundary, type BoundaryFeature } from "../src/lib/boundary.ts";

const valid: BoundaryFeature = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [[
      [77.6995, 12.95],
      [77.7005, 12.95],
      [77.7005, 12.951],
      [77.6995, 12.951],
      [77.6995, 12.95],
    ]],
  },
};

test("validates a normal plot and reports useful local units", () => {
  const checked = validateBoundary(valid);
  const metrics = boundaryMetrics(checked);
  assert.ok(metrics.areaM2 > 10_000 && metrics.areaM2 < 15_000);
  assert.ok(metrics.acres > 2);
  assert.ok(metrics.guntas > 100);
  assert.equal(metrics.vertices, 4);
  assert.deepEqual(boundaryCenter(checked), { lng: 77.7, lat: 12.9505 });
});

test("rejects self-intersecting and undersized plots", () => {
  const bowTie: BoundaryFeature = {
    ...valid,
    geometry: {
      type: "Polygon",
      coordinates: [[[77.6995, 12.95], [77.7005, 12.951], [77.7005, 12.95], [77.6995, 12.951], [77.6995, 12.95]]],
    },
  };
  const tiny: BoundaryFeature = {
    ...valid,
    geometry: {
      type: "Polygon",
      coordinates: [[[77.7, 12.95], [77.70002, 12.95], [77.70002, 12.95002], [77.7, 12.95002], [77.7, 12.95]]],
    },
  };
  assert.throws(() => validateBoundary(bowTie), /crosses itself/);
  assert.throws(() => validateBoundary(tiny), /too small/);
});

test("reports live area for an unfinished three-corner polygon", () => {
  const open: BoundaryFeature = {
    ...valid,
    geometry: { type: "Polygon", coordinates: [valid.geometry.coordinates[0].slice(0, 3)] },
  };
  const draft = boundaryDraftMetrics(open);
  assert.equal(draft.vertices, 3);
  assert.ok((draft.metrics?.areaM2 ?? 0) > 5_000);
  assert.deepEqual(boundaryDraftMetrics({ ...open, geometry: { type: "Polygon", coordinates: [open.geometry.coordinates[0].slice(0, 2)] } }), {
    metrics: null,
    vertices: 2,
  });
});
