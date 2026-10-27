// Unit tests for src/pairing.js. Run: node --test 'tests/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPair, buildCandidates, rememberPair, emptyMemory, pairKey } from "../src/pairing.js";

// Deterministic PRNG (mulberry32) so statistical tests are stable.
function rng(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countPicks(n, fn) {
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const pair = fn(i);
    for (const id of pair) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

test("returns null with fewer than two candidates", () => {
  assert.equal(pickPair([], [], {}, rng()), null);
  assert.equal(pickPair([{ id: "1", rating: 1500, battles: 0 }], [], {}, rng()), null);
  assert.equal(pickPair([], ["1", "1"], {}, rng()), null);
});

test("always returns two distinct ids", () => {
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const [a, b] = pickPair([], ["1", "2", "3"], {}, r);
    assert.notEqual(a, b);
  }
});

test("buildCandidates merges ranked and sample, drops missing ids", () => {
  const c = buildCandidates([{ id: 1, rating: 1600, battles: 3 }], ["1", "2", "3"], 1500, new Set(["3"]));
  assert.deepEqual(c, [
    { id: "1", rating: 1600, battles: 3, ranked: true },
    { id: "2", rating: 1500, battles: 0, ranked: false },
  ]);
});

test("under-battled items appear more often", () => {
  const ranked = [
    { id: "veteran", rating: 1500, battles: 40 },
    { id: "fresh1", rating: 1500, battles: 0 },
    { id: "fresh2", rating: 1500, battles: 0 },
  ];
  const r = rng(3);
  const counts = countPicks(3000, () => pickPair(ranked, [], {}, r));
  assert.ok(counts.get("fresh1") > counts.get("veteran") * 2, JSON.stringify([...counts]));
});

test("opponents close in rating are preferred", () => {
  const ranked = [
    { id: "a", rating: 1500, battles: 5 },
    { id: "near", rating: 1520, battles: 5 },
    { id: "far", rating: 1900, battles: 5 },
  ];
  const r = rng(11);
  let near = 0, far = 0;
  for (let i = 0; i < 3000; i++) {
    const key = pairKey(...pickPair(ranked, [], {}, r));
    if (key === pairKey("a", "near")) near++;
    if (key === pairKey("a", "far")) far++;
  }
  assert.ok(near > far * 5, `near=${near} far=${far}`);
});

test("recent pairs are never repeated", () => {
  const recentPairs = new Set([pairKey("1", "2")]);
  const r = rng(5);
  for (let i = 0; i < 500; i++) {
    const pair = pickPair([], ["1", "2", "3"], { recentPairs }, r);
    assert.notEqual(pairKey(...pair), pairKey("1", "2"));
  }
});

test("returns null when every possible pair is recent", () => {
  const recentPairs = new Set([pairKey("1", "2")]);
  assert.equal(pickPair([], ["1", "2"], { recentPairs }, rng()), null);
});

test("recently shown items are damped", () => {
  const sample = ["1", "2", "3", "4", "5", "6"];
  const r = rng(9);
  const recentItems = new Set(["1"]);
  const counts = countPicks(3000, () => pickPair([], sample, { recentItems }, r));
  assert.ok(counts.get("1") < counts.get("2") / 2, JSON.stringify([...counts]));
});

test("rememberPair keeps bounded, most-recent-first memory", () => {
  let m = emptyMemory();
  m = rememberPair(m, "1", "2", { pairs: 2, items: 3 });
  m = rememberPair(m, "3", "4", { pairs: 2, items: 3 });
  m = rememberPair(m, "5", "6", { pairs: 2, items: 3 });
  assert.deepEqual(m.pairList, [pairKey("5", "6"), pairKey("3", "4")]);
  assert.deepEqual(m.itemList, ["5", "6", "3"]);
  assert.ok(m.recentPairs.has(pairKey("6", "5")));
});

test("filters: deny drops ids, allow restricts the pool", () => {
  const ranked = [1, 2, 3, 4].map((i) => ({ id: String(i), rating: 1500, battles: 0 }));
  const c1 = buildCandidates(ranked, ["5"], 1500, new Set(), { deny: new Set(["1", "5"]) });
  assert.deepEqual(c1.map((c) => c.id), ["2", "3", "4"]);
  const c2 = buildCandidates(ranked, ["5", "6"], 1500, new Set(), { allow: new Set(["2", "6"]) });
  assert.deepEqual(c2.map((c) => c.id), ["2", "6"]);
  for (let i = 0; i < 50; i++) {
    const pair = pickPair(ranked, ["5", "6"], { allow: new Set(["2", "6"]) }, rng(i + 1));
    assert.deepEqual([...pair].sort(), ["2", "6"]);
  }
});

test("conflicts rejects pairs", () => {
  const ranked = ["1", "2", "3"].map((id) => ({ id, rating: 1500, battles: 0 }));
  const conflicts = (a, b) => [a, b].sort().join() === "1,2";
  for (let i = 0; i < 100; i++) {
    const pair = pickPair(ranked, [], { conflicts }, rng(i + 1));
    assert.notDeepEqual([...pair].sort(), ["1", "2"]);
  }
  assert.equal(pickPair(ranked.slice(0, 2), [], { conflicts }, rng()), null);
});
