// Unit tests for src/aggregate.js. Run: node --test 'tests/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayKey, lastMonths, streaks, countBy, bucketize, topN, sceneActivity, periodTotals, dailySeries,
  monthlySeries, ageOn, performerStats, bucketMean, sceneFileStats, AGE_BUCKETS,
} from "../src/aggregate.js";

const NOW = new Date(2026, 9, 27, 12, 0); // 27 Oct 2026, local time
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();

test("dates and months", () => {
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
  const months = lastMonths(3, NOW);
  assert.deepEqual(months.map((m) => m.key), ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual([months[2].start, months[2].end], ["2026-10-01", "2026-11-01"]);
  assert.deepEqual(lastMonths(2, new Date(2026, 0, 15)).map((m) => m.key), ["2025-12", "2026-01"]);
});

test("streaks", () => {
  const s = streaks(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-25", "2026-10-26", "2026-10-27"], NOW);
  assert.deepEqual(s, { current: 3, longest: 3, longestEnd: "2026-10-22", activeDays: 6 });
  assert.equal(streaks(["2026-10-25", "2026-10-26"], NOW).current, 2); // ended yesterday: still current
  assert.equal(streaks(["2026-10-20"], NOW).current, 0);
  assert.deepEqual(streaks([], NOW), { current: 0, longest: 0, longestEnd: null, activeDays: 0 });
});

test("countBy, bucketize, topN", () => {
  assert.deepEqual(countBy(["a", "b", "a", null, ""], (x) => x), [{ label: "a", value: 2 }, { label: "b", value: 1 }]);
  assert.deepEqual(bucketize([18, 22, 23, 50, 90, null, 10], AGE_BUCKETS).map((b) => b.value), [2, 1, 0, 0, 0, 2]);
  assert.deepEqual(topN([{ id: 1, v: 3 }, { id: 2, v: 0 }, { id: 3, v: 5 }], (x) => x.v, (x) => `n${x.id}`, 5),
    [{ id: "3", name: "n3", value: 5 }, { id: "1", name: "n1", value: 3 }]);
});

test("scene activity", () => {
  const scenes = [
    { id: 1, title: "A", play_count: 3, o_counter: 1, play_duration: 600, date: "2024-05-01",
      play_history: [local(2026, 10, 27, 21), local(2026, 10, 26, 21), local(2026, 10, 1, 9)],
      o_history: [local(2026, 10, 26, 22)], files: [{ size: 2e9, duration: 1800 }] },
    { id: 2, title: "", files: [{ basename: "b.mp4", size: 5e7, duration: 60 }, { size: 1e6 }], play_count: 1, play_duration: 30,
      play_history: [local(2026, 10, 27, 8)], o_history: [] },
    { id: 3, title: "C", play_count: 0, files: [] },
  ];
  const a = sceneActivity(scenes, NOW);
  assert.deepEqual(a.plays, { "2026-10-27": 2, "2026-10-26": 1, "2026-10-01": 1 });
  assert.equal(a.playStreak.current, 2);
  assert.equal(a.oStreak.current, 1);
  assert.equal(a.playHeat[0][21], 1); // 26 Oct 2026 is a Monday
  assert.equal(a.oHeat[0][22], 1);
  assert.deepEqual(a.topPlayed.map((r) => r.name), ["A", "b.mp4"]);
  assert.deepEqual([a.neverPlayed, a.playedWithoutO, a.withO, a.multiFile], [1, 1, 1, 1]);
  assert.deepEqual(a.releaseYears, [{ label: "2024", value: 1 }]);
  assert.equal(a.largest[0].name, "A");
  assert.deepEqual(a.busiestPlayDay, { label: "2026-10-27", value: 2 });

  const p = periodTotals(a.plays, NOW);
  assert.deepEqual(p, { today: 2, week: 3, month: 4, year: 4, all: 4 });
  assert.deepEqual(dailySeries(a.plays, 2, NOW), [{ label: "2026-10-26", value: 1 }, { label: "2026-10-27", value: 2 }]);
  assert.deepEqual(monthlySeries(a.plays, 2, NOW), [{ label: "2026-09", value: 0 }, { label: "2026-10", value: 4 }]);
});

test("file stats", () => {
  const f = sceneFileStats([
    { files: [{ basename: "a.MP4", video_codec: "h264", audio_codec: "aac", frame_rate: 29.97, bit_rate: 4e6 }] },
    { files: [{ basename: "b.mkv", video_codec: "hevc", audio_codec: "", frame_rate: 60, bit_rate: 12e6 }] },
    { files: [] },
  ]);
  assert.deepEqual(f.containers.map((c) => c.label).sort(), ["mkv", "mp4"]);
  assert.deepEqual(f.audioCodecs.map((c) => c.label).sort(), ["aac", "none"]);
  assert.deepEqual(f.frameRates.map((b) => b.value), [0, 1, 0, 1, 0]);
  assert.equal(f.averageBitRate, 8e6);
});

test("performers and ratings", () => {
  assert.equal(ageOn("2000-10-28", NOW), 25);
  assert.equal(ageOn("2000-10-27", NOW), 26);
  assert.equal(ageOn(null, NOW), null);
  const p = performerStats([
    { id: 1, name: "A", gender: "FEMALE", birthdate: "2000-01-01", favorite: true, scene_count: 5, height_cm: 165, country: "FI" },
    { id: 2, name: "B", gender: null, birthdate: "1950-01-01", death_date: "2000-01-01", scene_count: 0 },
  ], NOW);
  assert.deepEqual([p.total, p.favorites, p.unknownGender, p.withScenes, p.averageAge], [2, 1, 1, 1, 26]);
  assert.deepEqual(p.genders, [{ label: "Female", value: 1 }]);
  assert.equal(bucketMean([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(bucketMean([0, 0, 0, 0, 1, 1, 0, 0, 0, 0]), 50.5);
});
