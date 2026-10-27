// Pure aggregation helpers (no Stash or DOM access) so they can be unit
// tested with `node --test`. Every function returns small plain objects that
// can be cached as JSON.

// ---------------------------------------------------------------- Dates

const pad = (n) => String(n).padStart(2, "0");

/** Local calendar day "YYYY-MM-DD" of a timestamp or Date. */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The last `n` months, oldest first: [{ key, start, end }] with ISO date bounds. */
export function lastMonths(n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    out.push({ key: monthKey(start), start: dayKey(start), end: dayKey(end) });
  }
  return out;
}

/** "YYYY-MM-DD" n days before `now`. */
export function daysAgo(n, now = new Date()) {
  return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
}

const dayNumber = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/**
 * Streaks of consecutive active days. `days` = iterable of "YYYY-MM-DD".
 * The current streak counts if its last day is today or yesterday.
 */
export function streaks(days, now = new Date()) {
  const nums = [...new Set([...days].map(dayNumber))].sort((a, b) => a - b);
  let longest = 0;
  let longestEnd = null;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) { longest = run; longestEnd = nums[i]; }
  }
  const today = dayNumber(dayKey(now));
  const last = nums[nums.length - 1];
  const current = last === today || last === today - 1 ? run : 0;
  const toKey = (n) => (n == null ? null : new Date(n * 86400000).toISOString().slice(0, 10));
  return { current, longest, longestEnd: toKey(longestEnd), activeDays: nums.length };
}

// ---------------------------------------------------------------- Lists

/** Count values into [{ label, value }] sorted by count. Empty values are skipped. */
export function countBy(items, keyFn, limit = Infinity) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null || k === "") continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)))
    .slice(0, limit);
}

/** buckets = [{ label, min, max }] (min inclusive, max exclusive, null = open). */
export function bucketize(values, buckets) {
  const out = buckets.map((b) => ({ label: b.label, value: 0 }));
  for (const v of values) {
    if (v == null || Number.isNaN(v)) continue;
    const i = buckets.findIndex((b) => (b.min == null || v >= b.min) && (b.max == null || v < b.max));
    if (i >= 0) out[i].value += 1;
  }
  return out;
}

/** Top n items by `value(it)` (> 0) as [{ id, name, value }]. */
export function topN(items, value, name, n = 10) {
  return items.map((it) => ({ id: String(it.id), name: name(it), value: value(it) || 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export const sum = (list, fn = (x) => x) => list.reduce((s, x) => s + (fn(x) || 0), 0);

// ---------------------------------------------------------------- Scenes

export const SIZE_BUCKETS = [
  { label: "< 100 MB", max: 100e6 }, { label: "100–500 MB", min: 100e6, max: 500e6 },
  { label: "0.5–1 GB", min: 500e6, max: 1e9 }, { label: "1–2 GB", min: 1e9, max: 2e9 },
  { label: "2–5 GB", min: 2e9, max: 5e9 }, { label: "5 GB +", min: 5e9 },
];

const sceneTitle = (s) => s.title || s.files?.[0]?.basename || `Scene ${s.id}`;

/**
 * Activity and file statistics from scenes with
 * { id, title, date, play_count, play_duration, o_counter, play_history, o_history, files { basename size duration } }.
 */
export function sceneActivity(scenes, now = new Date()) {
  const plays = {};
  const os = {};
  const playHeat = Array.from({ length: 7 }, () => Array(24).fill(0)); // [weekday][hour], Monday first
  const oHeat = Array.from({ length: 7 }, () => Array(24).fill(0));
  let firstO = null, lastO = null, firstPlay = null, lastPlay = null;
  const mark = (heat, map, ts) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    map[dayKey(d)] = (map[dayKey(d)] || 0) + 1;
    heat[(d.getDay() + 6) % 7][d.getHours()] += 1;
    return d.toISOString();
  };
  for (const s of scenes) {
    for (const ts of s.play_history || []) {
      const iso = mark(playHeat, plays, ts);
      if (iso && (!firstPlay || iso < firstPlay)) firstPlay = iso;
      if (iso && (!lastPlay || iso > lastPlay)) lastPlay = iso;
    }
    for (const ts of s.o_history || []) {
      const iso = mark(oHeat, os, ts);
      if (iso && (!firstO || iso < firstO)) firstO = iso;
      if (iso && (!lastO || iso > lastO)) lastO = iso;
    }
  }
  const busiest = (map) => Object.entries(map).reduce((b, [k, v]) => (!b || v > b.value ? { label: k, value: v } : b), null);
  const played = scenes.filter((s) => (s.play_count || 0) > 0);
  const sizes = scenes.map((s) => sum(s.files || [], (f) => f.size));
  const largest = scenes.map((s, i) => ({ id: String(s.id), name: sceneTitle(s), value: sizes[i] }))
    .sort((a, b) => b.value - a.value).slice(0, 5);
  const longest = topN(scenes, (s) => s.files?.[0]?.duration, sceneTitle, 5);
  return {
    plays, os, playHeat, oHeat,
    playStreak: streaks(Object.keys(plays), now),
    oStreak: streaks(Object.keys(os), now),
    firstPlay, lastPlay, firstO, lastO,
    busiestPlayDay: busiest(plays),
    busiestODay: busiest(os),
    topPlayed: topN(scenes, (s) => s.play_count, sceneTitle),
    topO: topN(scenes, (s) => s.o_counter, sceneTitle),
    topPlayTime: topN(scenes, (s) => s.play_duration, sceneTitle),
    neverPlayed: scenes.length - played.length,
    playedWithoutO: played.filter((s) => !(s.o_counter > 0)).length,
    withO: scenes.filter((s) => s.o_counter > 0).length,
    releaseYears: countBy(scenes, (s) => (s.date ? s.date.slice(0, 4) : null)).sort((a, b) => a.label.localeCompare(b.label)),
    sizeBuckets: bucketize(sizes.filter((v) => v > 0), SIZE_BUCKETS),
    largest,
    longest,
    multiFile: scenes.filter((s) => (s.files || []).length > 1).length,
  };
}

/** Per-period sums from a { day: count } map: today, last 7 / 30 days, and per week/month series. */
export function periodTotals(map, now = new Date()) {
  const inLast = (n) => {
    const from = daysAgo(n - 1, now);
    return sum(Object.entries(map).filter(([k]) => k >= from), ([, v]) => v);
  };
  return { today: map[dayKey(now)] || 0, week: inLast(7), month: inLast(30), year: inLast(365), all: sum(Object.values(map)) };
}

/** Daily series for the last `n` days, oldest first: [{ label, value }]. */
export function dailySeries(map, n, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = daysAgo(i, now);
    out.push({ label: key, value: map[key] || 0 });
  }
  return out;
}

/** Monthly series from a { day: count } map for the last `n` months. */
export function monthlySeries(map, n, now = new Date()) {
  const months = Object.fromEntries(lastMonths(n, now).map((m) => [m.key, 0]));
  for (const [day, v] of Object.entries(map)) {
    const k = day.slice(0, 7);
    if (k in months) months[k] += v;
  }
  return Object.entries(months).map(([label, value]) => ({ label, value }));
}

// ---------------------------------------------------------------- People

export const AGE_BUCKETS = [
  { label: "18–22", min: 18, max: 23 }, { label: "23–27", min: 23, max: 28 }, { label: "28–32", min: 28, max: 33 },
  { label: "33–39", min: 33, max: 40 }, { label: "40–49", min: 40, max: 50 }, { label: "50 +", min: 50 },
];
export const HEIGHT_BUCKETS = [
  { label: "< 155", max: 155 }, { label: "155–159", min: 155, max: 160 }, { label: "160–164", min: 160, max: 165 },
  { label: "165–169", min: 165, max: 170 }, { label: "170–174", min: 170, max: 175 }, { label: "175–179", min: 175, max: 180 },
  { label: "180 +", min: 180 },
];
export const GENDER_LABEL = {
  FEMALE: "Female", MALE: "Male", TRANSGENDER_FEMALE: "Trans female", TRANSGENDER_MALE: "Trans male",
  INTERSEX: "Intersex", NON_BINARY: "Non-binary",
};

export function ageOn(birthdate, now = new Date()) {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  if (!y) return null;
  let age = now.getFullYear() - y;
  if (m && (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && d && now.getDate() < d))) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Performers with { id name gender birthdate death_date country ethnicity hair_color eye_color height_cm favorite rating100 scene_count image_count o_counter stash_ids }. */
export function performerStats(performers, now = new Date()) {
  const name = (p) => p.name;
  const living = performers.filter((p) => !p.death_date);
  const ages = living.map((p) => ageOn(p.birthdate, now)).filter((a) => a != null);
  return {
    total: performers.length,
    favorites: performers.filter((p) => p.favorite).length,
    genders: countBy(performers, (p) => GENDER_LABEL[p.gender] || null),
    unknownGender: performers.filter((p) => !p.gender).length,
    ages: bucketize(ages, AGE_BUCKETS),
    averageAge: ages.length ? Math.round((sum(ages) / ages.length) * 10) / 10 : null,
    heights: bucketize(performers.map((p) => p.height_cm).filter((h) => h > 0), HEIGHT_BUCKETS),
    countries: countBy(performers, (p) => p.country || null, 12),
    ethnicities: countBy(performers, (p) => p.ethnicity || null, 8),
    hairColors: countBy(performers, (p) => p.hair_color || null, 8),
    eyeColors: countBy(performers, (p) => p.eye_color || null, 8),
    topScenes: topN(performers, (p) => p.scene_count, name),
    topImages: topN(performers, (p) => p.image_count, name),
    topO: topN(performers, (p) => p.o_counter, name),
    topRated: topN(performers, (p) => p.rating100, name),
    withScenes: performers.filter((p) => p.scene_count > 0).length,
  };
}

/** Top lists for studios / tags / groups / galleries. */
export function entityTops(items, fields, name, n = 10) {
  return Object.fromEntries(fields.map((f) => [f, topN(items, (it) => it[f], name, n)]));
}

// ---------------------------------------------------------------- Ratings

export const RATING_BUCKETS = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10 + 1}–${i * 10 + 10}`, min: i * 10 + 1, max: i * 10 + 10 }));

/** Approximate mean rating from 10-point bucket counts (bucket midpoints). */
export function bucketMean(counts) {
  const n = sum(counts);
  if (!n) return null;
  return Math.round((sum(counts.map((c, i) => c * (i * 10 + 5.5))) / n) * 10) / 10;
}

// ---------------------------------------------------------------- Files

export const FPS_BUCKETS = [
  { label: "< 24", max: 23.5 }, { label: "24–30", min: 23.5, max: 30.5 }, { label: "31–49", min: 30.5, max: 49.5 },
  { label: "50–60", min: 49.5, max: 60.5 }, { label: "> 60", min: 60.5 },
];
export const BITRATE_BUCKETS = [
  { label: "< 2 Mbps", max: 2e6 }, { label: "2–5 Mbps", min: 2e6, max: 5e6 }, { label: "5–10 Mbps", min: 5e6, max: 10e6 },
  { label: "10–20 Mbps", min: 10e6, max: 20e6 }, { label: "20 Mbps +", min: 20e6 },
];

const extension = (name) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name || "");
  return m ? m[1].toLowerCase() : null;
};

/** Codec, frame rate, bit rate and container statistics from scenes' primary files. */
export function sceneFileStats(scenes) {
  const files = scenes.map((s) => s.files?.[0]).filter(Boolean);
  return {
    videoCodecs: countBy(files, (f) => f.video_codec || null, 8),
    audioCodecs: countBy(files, (f) => f.audio_codec || "none", 8),
    containers: countBy(files, (f) => extension(f.basename), 8),
    frameRates: bucketize(files.map((f) => f.frame_rate), FPS_BUCKETS),
    bitRates: bucketize(files.map((f) => f.bit_rate).filter((b) => b > 0), BITRATE_BUCKETS),
    averageBitRate: files.length ? Math.round(sum(files, (f) => f.bit_rate) / files.length) : null,
  };
}

// ---------------------------------------------------------------- Os (Vibings Better Os)

export const POSITION_BUCKETS = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i * 10 + 10}%`, min: i * 10, max: i === 9 ? null : i * 10 + 10 }));
export const INTO_BUCKETS = [
  { label: "< 2 min", max: 120 }, { label: "2–5 min", min: 120, max: 300 }, { label: "5–10 min", min: 300, max: 600 },
  { label: "10–20 min", min: 600, max: 1200 }, { label: "20–30 min", min: 1200, max: 1800 }, { label: "30–60 min", min: 1800, max: 3600 },
  { label: "1 h +", min: 3600 },
];
export const BEFORE_END_BUCKETS = [
  { label: "Last 30 s", max: 30 }, { label: "30 s–1 min", min: 30, max: 60 }, { label: "1–2 min", min: 60, max: 120 },
  { label: "2–5 min", min: 120, max: 300 }, { label: "5–10 min", min: 300, max: 600 }, { label: "10 min +", min: 600 },
];
export const VIEW_BUCKETS = [
  { label: "< 10 s", max: 10 }, { label: "10–30 s", min: 10, max: 30 }, { label: "30 s–1 min", min: 30, max: 60 },
  { label: "1–3 min", min: 60, max: 180 }, { label: "3–10 min", min: 180, max: 600 }, { label: "10 min +", min: 600 },
];

export function median(values) {
  const v = values.filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
const mean = (values) => (values.length ? sum(values) / values.length : null);
const imageTitle = (i) => i.title || i.visual_files?.[0]?.basename || `Image ${i.id}`;
const utcSecond = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19) + "Z";
};

/**
 * O statistics. scenes = [{ id, title, o_counter, o_history, files { basename duration }, tags { id name } }]
 * with o_counter > 0, images = [{ id, title, o_counter, visual_files { basename } }] with o_counter > 0,
 * detail = Vibings Better Os data ({ scenes: { id: [{ at, t, d }] }, images: { id: [{ at, view }] } }) or null.
 * A detail only counts while its O is still in Stash.
 */
export function oStats(scenes, images, detail, recentLimit = 12) {
  const timed = []; // { scene, at, t, d }
  const recent = [];
  let sceneOs = 0;
  for (const s of scenes) {
    const history = (s.o_history || []).map(utcSecond).filter(Boolean);
    sceneOs += Math.max(s.o_counter || 0, history.length);
    const byAt = new Map((detail?.scenes?.[s.id] || []).map((e) => [e.at, e]));
    const duration = s.files?.[0]?.duration || null;
    for (const at of history) {
      const e = byAt.get(at);
      const d = e?.d || duration;
      const row = { kind: "scene", id: String(s.id), name: sceneTitle(s), at, t: e?.t ?? null, d };
      if (row.t != null) timed.push(row);
      recent.push(row);
    }
  }
  let imageOs = 0;
  const sessions = [];
  for (const i of images) {
    imageOs += i.o_counter || 0;
    const events = (detail?.images?.[i.id] || []).slice(-(i.o_counter || 0));
    for (const e of events) {
      const row = { kind: "image", id: String(i.id), name: imageTitle(i), at: e.at, view: e.view ?? null };
      if (row.view != null) sessions.push(row);
      recent.push(row);
    }
  }

  const pcts = timed.filter((r) => r.d).map((r) => Math.min(100, (r.t / r.d) * 100));
  const beforeEnd = timed.filter((r) => r.d).map((r) => Math.max(0, r.d - r.t));
  const views = sessions.map((r) => r.view);

  const tagCounts = new Map();
  for (const s of scenes) {
    for (const t of s.tags || []) {
      const cur = tagCounts.get(t.id) || { id: String(t.id), name: t.name, value: 0 };
      cur.value += s.o_counter || 0;
      tagCounts.set(t.id, cur);
    }
  }

  return {
    hasDetail: !!detail,
    sceneOs,
    imageOs,
    totalOs: sceneOs + imageOs,
    scenesWithO: scenes.length,
    imagesWithO: images.length,
    timedOs: timed.length,
    sessionOs: sessions.length,
    coverage: [
      { label: "Scene Os with position", value: timed.length },
      { label: "Classic scene Os", value: sceneOs - timed.length },
      { label: "Image Os with viewing time", value: sessions.length },
      { label: "Classic image Os", value: imageOs - sessions.length },
    ],
    positionBuckets: bucketize(pcts, POSITION_BUCKETS),
    intoBuckets: bucketize(timed.map((r) => r.t), INTO_BUCKETS),
    beforeEndBuckets: bucketize(beforeEnd, BEFORE_END_BUCKETS),
    viewBuckets: bucketize(views, VIEW_BUCKETS),
    meanPct: mean(pcts),
    medianPct: median(pcts),
    meanT: mean(timed.map((r) => r.t)),
    medianBeforeEnd: median(beforeEnd),
    meanView: mean(views),
    medianView: median(views),
    quickest: [...timed].sort((a, b) => a.t - b.t).slice(0, 5).map((r) => ({ id: r.id, name: r.name, value: r.t })),
    latestInVideo: [...timed].filter((r) => r.d).sort((a, b) => (b.t / b.d) - (a.t / a.d)).slice(0, 5)
      .map((r) => ({ id: r.id, name: r.name, value: Math.min(100, Math.round((r.t / r.d) * 100)) })),
    longestViews: [...sessions].sort((a, b) => b.view - a.view).slice(0, 5).map((r) => ({ id: r.id, name: r.name, value: r.view })),
    topTags: [...tagCounts.values()].filter((t) => t.value > 0).sort((a, b) => b.value - a.value).slice(0, 10),
    topImages: topN(images, (i) => i.o_counter, imageTitle, 10),
    recent: recent.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, recentLimit),
  };
}
