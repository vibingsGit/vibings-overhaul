// Build and version rules, and the curve maths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SegmentRecorder, addSegments, curveValues, curvePath } from "../src/heat.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("version is the same everywhere", () => {
  const yml = read("../settings.yml").match(/^version:\s*(\S+)/m)[1];
  const pkg = JSON.parse(read("../package.json")).version;
  const ui = read("../src/api.js").match(/export const VERSION = "([^"]+)"/)[1];
  const backend = read("../backend/vibings_scene_heatmap.py").match(/^VERSION = "([^"]+)"/m)[1];
  assert.deepEqual({ pkg, ui, backend }, { pkg: yml, ui: yml, backend: yml });
});

test("no replacement patterns that stash-plugin-builder corrupts", () => {
  const files = ["../src/", "../../_shared/"].flatMap((dir) =>
    readdirSync(new URL(dir, import.meta.url)).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => dir + f));
  for (const f of files) assert.doesNotMatch(read(f), /\$[`'&]/, f);
});

function play(rec, samples) {
  for (const [t, wall, extra = {}] of samples) rec.sample({ t, wall: wall * 1000, ...extra });
}

test("segments follow playback, not seeks or pauses", () => {
  const rec = new SegmentRecorder();
  play(rec, [[0, 0], [1, 1], [2, 2], [60, 2.2], [61, 3.2], [62, 4.2], [62, 10, { paused: true }], [63, 11]]);
  rec.close();
  assert.deepEqual(rec.take(), [[0, 2], [60, 62], [62, 63]]); // after the pause it plays on
});

test("take keeps the open segment going", () => {
  const rec = new SegmentRecorder();
  play(rec, [[10, 0], [11, 1], [12, 2]]);
  assert.deepEqual(rec.take(), [[10, 12]]);
  play(rec, [[13, 3], [14, 4]]);
  assert.deepEqual(rec.take(), [[12, 14]]);
  assert.deepEqual(rec.take(), []);
});

test("bins and curve", () => {
  const bins = addSegments(new Array(10).fill(0), 100, [[0, 25], [20, 30]]);
  assert.deepEqual(bins.slice(0, 4), [10, 10, 15, 0]); // 20–25 watched twice
  const v = curveValues([0, 0, 10, 0, 0], 0);
  assert.deepEqual(v, [0, 0, 1, 0, 0]);
  const smooth = curveValues([0, 0, 10, 0, 0], 1);
  assert.equal(Math.max(...smooth), 1);
  assert.ok(smooth[1] > 0 && smooth[1] < 1);
  assert.deepEqual(curveValues([], 3), []);
  assert.match(curvePath([0, 1], 100, 10), /^M0,10 L0\.0,9\.4 C/);
});
