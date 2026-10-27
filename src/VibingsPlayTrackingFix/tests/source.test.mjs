// Build and version rules, and the counting rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { WatchClock, PlaySession, isLoop, startsOver, playThreshold, resumeTime, SYNC_EVERY } from "../src/session.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("version is the same everywhere", () => {
  const yml = read("../settings.yml").match(/^version:\s*(\S+)/m)[1];
  const pkg = JSON.parse(read("../package.json")).version;
  const ui = read("../src/api.js").match(/export const VERSION = "([^"]+)"/)[1];
  const backend = read("../backend/vibings_play_tracking.py").match(/^VERSION = "([^"]+)"/m)[1];
  assert.deepEqual({ pkg, ui, backend }, { pkg: yml, ui: yml, backend: yml });
});

// stash-plugin-builder rewrites the source with String.replace, which turns
// "$" + backtick (and "$'" / "$&") into other text and breaks the bundle.
test("no replacement patterns that stash-plugin-builder corrupts", () => {
  const files = ["../src/", "../../_shared/"].flatMap((dir) =>
    readdirSync(new URL(dir, import.meta.url)).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => dir + f));
  for (const f of files) assert.doesNotMatch(read(f), /\$[`'&]/, f);
});

// Plays the clock through samples [t, wallSeconds, extra] and returns the counted seconds.
function run(samples) {
  const clock = new WatchClock();
  let total = 0;
  for (const [t, wall, extra = {}] of samples) total += clock.sample({ t, wall: wall * 1000, ...extra });
  return total;
}

test("normal playback counts video time", () => {
  const samples = [];
  for (let i = 0; i <= 40; i++) samples.push([i * 0.25, i * 0.25]);
  assert.equal(run(samples), 10);
});

test("paused time does not count", () => {
  assert.equal(run([[0, 0], [5, 5], [5, 60, { paused: true }], [5, 120, { paused: true }], [6, 121]]), 6);
});

test("skipping forward on the timeline does not count", () => {
  assert.equal(run([[0, 0], [1, 1], [300, 1.2], [301, 2.2]]), 2);
});

test("skipping backward does not count", () => {
  assert.equal(run([[100, 0], [101, 1], [20, 1.1], [21, 2.1]]), 2);
});

test("seeking does not count", () => {
  assert.equal(run([[0, 0], [1, 1], [50, 1.1, { seeking: true }], [51, 2.1]]), 2);
});

test("faster playback counts the video time that went by", () => {
  const samples = [];
  for (let i = 0; i <= 20; i++) samples.push([i * 0.5, i * 0.25, { rate: 2 }]);
  assert.equal(run(samples), 10);
});

test("a late timeupdate in a background tab still counts", () => {
  assert.equal(run([[0, 0], [1.05, 1], [2.1, 2]]), 2.1);
});

test("loop detection", () => {
  assert.equal(isLoop(598, 0.2, 600), true);
  assert.equal(isLoop(300, 0.2, 600), false);
  assert.equal(isLoop(598, 100, 600), false);
  // Short videos: the edge shrinks to 15 % of the length (at least 0.5 s).
  assert.equal(isLoop(4.9, 0.05, 5), true);
  assert.equal(isLoop(4, 0, 5), false);
  assert.equal(isLoop(4.0, 0.1, 4.17), true);
  assert.equal(isLoop(0.9, 0.1, 1), false); // too short to tell
});

test("a jump back to the start is a new viewing once the play is counted", () => {
  assert.equal(startsOver(598, 0, 600, false), true); // loop / replay from the end
  assert.equal(startsOver(300, 0, 600, false), false); // not counted yet: same viewing
  assert.equal(startsOver(300, 0, 600, true), true); // counted: watching again
  assert.equal(startsOver(300, 120, 600, true), false); // not to the start
  assert.equal(startsOver(2, 0.5, 600, true), false); // a small step back
});

test("play threshold and resume point", () => {
  assert.equal(playThreshold(600), 150);
  assert.equal(playThreshold(600, 50), 300);
  assert.equal(playThreshold(600, 0), 1);
  assert.equal(playThreshold(600, null), 150);
  assert.equal(playThreshold(0), Infinity);
  assert.equal(resumeTime(120, 600), 120);
  assert.equal(resumeTime(590, 600), 0);
  assert.equal(resumeTime(NaN, 600), 0);
});

test("a session counts one play and asks for saves", () => {
  const s = new PlaySession(7, 25);
  let plays = 0, saves = 0;
  for (let i = 0; i < 200; i++) {
    const out = s.add(1, 400);
    if (out.countPlay) plays++;
    if (out.save) { saves++; s.take(); }
  }
  assert.equal(plays, 1);
  assert.equal(s.counted, true);
  assert.equal(saves, 200 / SYNC_EVERY);
  assert.equal(s.watched, 200);
  assert.equal(s.unsaved, 0);
});

test("a session below the threshold counts no play", () => {
  const s = new PlaySession("7", 25);
  for (let i = 0; i < 99; i++) assert.equal(s.add(1, 400).countPlay, false);
  assert.equal(s.add(1, 400).countPlay, true);
});
