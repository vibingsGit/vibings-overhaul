// Build and version rules, and the pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fmtTime, fmtDuration, fmtBytes, fmtAgo, sceneTitle, age, parseSpriteVtt, cueAt, scoreScenes } from "../src/format.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("version is the same everywhere", () => {
  const yml = read("../settings.yml").match(/^version:\s*(\S+)/m)[1];
  const pkg = JSON.parse(read("../package.json")).version;
  const ui = read("../src/api.js").match(/export const VERSION = "([^"]+)"/)[1];
  assert.deepEqual({ pkg, ui }, { pkg: yml, ui: yml });
});

// stash-plugin-builder rewrites the source with String.replace, which turns
// "$" + backtick (and "$'" / "$&") into other text and breaks the bundle.
test("no replacement patterns that stash-plugin-builder corrupts", () => {
  const files = ["../src/", "../../_shared/"].flatMap((dir) =>
    readdirSync(new URL(dir, import.meta.url)).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => dir + f));
  for (const f of files) assert.doesNotMatch(read(f), /\$[`'&]/, f);
});

test("formatting", () => {
  assert.equal(fmtTime(65.9), "1:05");
  assert.equal(fmtTime(3723), "1:02:03");
  assert.equal(fmtTime(NaN), "0:00");
  assert.equal(fmtDuration(35), "35 s");
  assert.equal(fmtDuration(3900), "1 h 05 min");
  assert.equal(fmtBytes(1536), "1.5 KB");
  assert.equal(fmtBytes(0), "–");
  assert.equal(fmtAgo(Date.now() - 90 * 60 * 1000), "2 h ago");
  assert.equal(sceneTitle({ id: 3, files: [{ path: "/a/b/clip.mp4" }] }), "clip.mp4");
  assert.equal(sceneTitle({ id: 3, title: "T" }), "T");
  assert.equal(age("2000-06-15", new Date("2026-06-14")), 25);
  assert.equal(age("2000-06-15", new Date("2026-06-15")), 26);
  assert.equal(age(null), null);
});

const VTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
scene_sprite.jpg#xywh=0,0,160,90

00:00:05.000 --> 00:00:10.000
scene_sprite.jpg#xywh=160,0,160,90

00:10.000 --> 00:15.000
scene_sprite.jpg#xywh=320,0,160,90
`;

test("sprite track", () => {
  const cues = parseSpriteVtt(VTT);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues[1], { start: 5, end: 10, x: 160, y: 0, w: 160, h: 90 });
  assert.equal(cueAt(cues, 7.5).x, 160);
  assert.equal(cueAt(cues, 0).x, 0);
  assert.equal(cueAt(cues, 99).x, 320); // past the end: the last cue
  assert.equal(cueAt([], 3), null);
});

test("recommendations prefer shared performers, then studio and tags", () => {
  const current = { id: 1, performers: [{ id: 7 }], tags: [{ id: 1 }, { id: 2 }], studio: { id: 9 } };
  const ranked = scoreScenes(current, [
    { id: 1, performers: [{ id: 7 }] }, // the scene itself
    { id: 2, tags: [{ id: 1 }] },
    { id: 3, performers: [{ id: 7 }] },
    { id: 4, studio: { id: 9 } },
    { id: 3, performers: [{ id: 7 }] }, // duplicate
  ]);
  assert.deepEqual(ranked.map((r) => r.scene.id), [3, 4, 2]);
});

test("activity grid", async () => {
  const { activityWeeks } = await import("../src/format.js");
  const today = new Date(2026, 9, 28); // Wednesday
  const grid = activityWeeks([new Date(2026, 9, 27, 20).toISOString(), new Date(2026, 9, 27, 21).toISOString(), new Date(2026, 9, 5, 10).toISOString()],
    [new Date(2026, 9, 27, 22).toISOString()], 4, today);
  assert.equal(grid.length, 4);
  assert.ok(grid.every((col) => col.length === 7));
  const last = grid[3];
  assert.equal(last[0].key, "2026-10-26"); // Monday
  assert.deepEqual([last[1].plays, last[1].os], [2, 1]);
  assert.equal(last[2].future, false);
  assert.equal(last[3].future, true);
  assert.equal(grid[0][0].key, "2026-10-05");
  assert.equal(grid[0][0].plays, 1);
});

test("video filters", async () => {
  const { videoCss, svgFilterMarkup, isDefaultVideo } = await import("../src/filters.js");
  assert.deepEqual(videoCss({}), { filter: "none", transform: "none" });
  assert.equal(isDefaultVideo({ brightness: 100 }), true);
  assert.equal(videoCss({ brightness: 120, hue: 30 }).filter, "brightness(1.2) hue-rotate(30deg)");
  assert.match(videoCss({ gamma: 120 }).filter, /^url\(#vbs-video-colour\)/);
  assert.equal(videoCss({ rotate: 90 }, 0.5).transform, "rotate(90deg) scale(0.5, 0.5)");
  assert.equal(videoCss({ flipH: true }).transform, "scale(-1, 1)");
  assert.match(svgFilterMarkup({ gamma: 200 }), /exponent="0\.500"/);
  assert.match(svgFilterMarkup({ sharpen: 50 }), /feConvolveMatrix/);
});

test("audio defaults", async () => {
  globalThis.window = globalThis.window || {};
  const { isDefaultAudio } = await import("../src/audio.js");
  assert.equal(isDefaultAudio({}), true);
  assert.equal(isDefaultAudio({ bass: 3 }), false);
});
