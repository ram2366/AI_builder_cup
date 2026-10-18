import assert from "node:assert/strict";
import test from "node:test";
import { clampWorkspaceWidth, defaultWorkspaceWidth } from "../src/lib/workspaceWidth.ts";

test("default workspace is 42 percent within its 520–760 px limits", () => {
  assert.equal(defaultWorkspaceWidth(1024), 520);
  assert.equal(defaultWorkspaceWidth(1440), 605);
  assert.equal(defaultWorkspaceWidth(2400), 760);
});

test("manual workspace resizing is clamped to 440 px and 60 percent", () => {
  assert.equal(clampWorkspaceWidth(300, 1200), 440);
  assert.equal(clampWorkspaceWidth(900, 1200), 720);
  assert.equal(clampWorkspaceWidth(600, 1200), 600);
});
