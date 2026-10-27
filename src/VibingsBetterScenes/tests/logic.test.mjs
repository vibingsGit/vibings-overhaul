// The player features' pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chapters, chapterAt, hottestTime, normalizeGain, loudnessMeter, playOrder, queueLink, sleepLeft } from "../src/logic.js";
import { scoreScenes } from "../src/format.js";

test("markers become chapters", () => {
  const list = chapters([
    { id: 2, seconds: 60, title: "", primary_tag: { name: "Two" } },
    { id: 1, seconds: 10, title: "One" },
    { id: 3, seconds: 500, title: "Past the end" },
  ], 120);
  assert.deepEqual(list.map((c) => [c.start, c.end, c.title]), [[10, 60, "One"], [60, 120, "Two"]]);
  assert.equal(chapterAt(list, 5), null);
  assert.equal(chapterAt(list, 10).title, "One");
  assert.equal(chapterAt(list, 119).title, "Two");
});

test("the most watched part", () => {
  const bins = new Array(200).fill(1);
  bins[150] = 40;
  bins[151] = 30;
  const t = hottestTime(bins, 400);
  assert.ok(t > 295 && t < 302, String(t)); // bin 150 of 200 starts at 300 s, 2 s lead
  assert.equal(hottestTime(new Array(200).fill(0.05), 400), null); // too little watched
  assert.equal(hottestTime(null, 400), null);
  assert.equal(hottestTime(bins, 0), null);
});

test("loudness levelling", () => {
  assert.equal(normalizeGain(-20), 1);
  assert.ok(Math.abs(normalizeGain(-26) - Math.pow(10, 6 / 20)) < 1e-9);
  assert.ok(Math.abs(normalizeGain(-50) - Math.pow(10, 12 / 20)) < 1e-9); // limited to +12 dB
  assert.equal(normalizeGain(-80), 1); // silence
  const m = loudnessMeter(10);
  for (let i = 0; i < 4; i++) m.add(0.1);
  assert.equal(m.db, null); // not enough yet
  m.add(0.1);
  m.add(0); // silence is ignored
  assert.ok(Math.abs(m.db - -20) < 1e-9);
  m.reset();
  assert.equal(m.db, null);
});

test("play order and queue links", () => {
  const scenes = [1, 2, 3, 4, 5].map((id) => ({ id }));
  assert.deepEqual(playOrder(3, ["5", "9"], scenes), ["1", "2", "3", "5", "9", "4"]);
  assert.deepEqual(playOrder(7, [], []), ["7"]);
  assert.equal(queueLink(["4", "8"]), "/scenes/4?qs=4&qs=8&continue=true");
  assert.equal(queueLink(["4", "8"], 1), "/scenes/8?qs=4&qs=8&continue=true");
  assert.equal(queueLink([]), null);
});

test("sleep timer", () => {
  assert.equal(sleepLeft(null), null);
  assert.equal(sleepLeft({ endOfScene: true }), null);
  assert.equal(sleepLeft({ until: 10000 }, 4000), 6);
  assert.equal(sleepLeft({ until: 1000 }, 4000), 0);
});

test("recommendation weights", () => {
  const cur = { id: 1, performers: [{ id: 7 }], tags: [{ id: 3 }], studio: { id: 9 } };
  const a = { id: 2, performers: [{ id: 7 }] };
  const b = { id: 3, studio: { id: 9 }, tags: [{ id: 3 }] };
  assert.deepEqual(scoreScenes(cur, [a, b]).map((x) => x.scene.id), [2, 3]);
  assert.deepEqual(scoreScenes(cur, [a, b], { performers: 1, studio: 5, tags: 2 }).map((x) => x.scene.id), [3, 2]);
});
