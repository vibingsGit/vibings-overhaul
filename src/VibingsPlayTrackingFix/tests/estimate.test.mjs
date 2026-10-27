// Estimated earlier play counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitHistory, estimatePlays, planEstimates, planTotals, earlierHistory, sameHistory } from "../src/estimate.js";

const START = "2026-10-27T00:00:00Z";

test("history splits at the start date", () => {
  const { earlier, later } = splitHistory(["2026-10-01T00:00:00Z", "2026-10-28T00:00:00Z", "2026-10-20T00:00:00Z", "bad"], START);
  assert.deepEqual(earlier, ["2026-10-20T00:00:00Z", "2026-10-01T00:00:00Z"]);
  assert.deepEqual(later, ["2026-10-28T00:00:00Z"]);
});

test("rounding", () => {
  assert.equal(estimatePlays(250, 100), 3);
  assert.equal(estimatePlays(240, 100), 2);
  assert.equal(estimatePlays(240, 100, "up"), 3);
  assert.equal(estimatePlays(299, 100, "down"), 2);
  assert.equal(estimatePlays(300, 100, "up"), 3);
  assert.equal(estimatePlays(40, 100), 0);
  assert.equal(estimatePlays(40, 0), 0);
});

const scenes = [
  // 1000 s earlier time on a 200 s video: 5 plays; Stash had 9 earlier plays and 1 later.
  { id: "1", title: "A", play_duration: 1100, files: [{ duration: 200 }],
    play_history: ["2026-10-28T00:00:00Z", ...Array.from({ length: 9 }, (_, i) => `2026-09-0${i + 1}T00:00:00Z`)] },
  // Plays but no play time (older Stash): kept.
  { id: "2", title: "B", play_duration: 0, files: [{ duration: 100 }], play_history: ["2026-01-01T00:00:00Z"] },
  // No length: kept.
  { id: "3", title: "C", play_duration: 500, files: [], play_history: [] },
  // Nothing at all: left out.
  { id: "4", title: "D", play_duration: 0, files: [{ duration: 100 }], play_history: [] },
];
const plugin = { installedAt: START, scenes: { "1": { s: 100, p: 1 } }, originals: {} };

test("plan", () => {
  const rows = planEstimates(scenes, plugin, { rounding: "nearest", skipWithoutTime: true });
  assert.deepEqual(rows.map((r) => [r.id, r.earlierSeconds, r.earlierPlays, r.estimate, r.change, r.skipped]), [
    ["1", 1000, 9, 5, -4, false],
    ["2", 0, 1, 1, 0, true],
    ["3", 500, 0, 0, 0, true],
  ]);
  const t = planTotals(rows);
  assert.deepEqual([t.scenes, t.estimated, t.skipped, t.changed, t.earlierPlays, t.estimatedPlays], [3, 1, 2, 1, 10, 6]);
});

test("plan without skipping sets scenes without earlier time to 0", () => {
  const rows = planEstimates(scenes, plugin, { skipWithoutTime: false });
  assert.equal(rows.find((r) => r.id === "2").estimate, 0);
});

test("a replaced scene is planned from its original count", () => {
  const replaced = scenes.map((s) => (s.id === "1" ? { ...s, play_history: ["2026-10-28T00:00:00Z", "2026-09-01T00:00:00Z"] } : s));
  const rows = planEstimates(replaced, { ...plugin, originals: { "1": 9 } }, {});
  const r = rows.find((x) => x.id === "1");
  assert.deepEqual([r.earlierPlays, r.inStash, r.estimate], [9, 1, 5]);
});

test("earlier history keeps the newest, then adds older entries", () => {
  const orig = ["2026-09-03T00:00:00Z", "2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z"];
  assert.deepEqual(earlierHistory(orig, 2, null, START), orig.slice(0, 2));
  assert.deepEqual(earlierHistory(orig, 5, null, START), [...orig, "2026-08-31T23:59:59Z", "2026-08-31T23:59:58Z"]);
  assert.deepEqual(earlierHistory([], 2, "2026-05-01T12:00:00Z", START), ["2026-05-01T11:59:59Z", "2026-05-01T11:59:58Z"]);
  // A creation time after the start date is moved back before it.
  assert.deepEqual(earlierHistory([], 1, "2026-11-01T00:00:00Z", START), ["2026-10-25T23:59:59Z"]);
  assert.deepEqual(earlierHistory([], 1, null, START), ["2026-10-25T23:59:59Z"]);
});

test("same history ignores order and format", () => {
  assert.equal(sameHistory(["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"], ["2026-01-02T00:00:00.000Z", "2026-01-01T02:00:00+02:00"]), true);
  assert.equal(sameHistory(["2026-01-01T00:00:00Z"], []), false);
});
