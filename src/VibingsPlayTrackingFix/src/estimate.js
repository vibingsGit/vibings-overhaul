// Estimated earlier play counts, kept free of the DOM so they can be tested.
//
// Earlier play time is what Stash counted before this plugin started: a
// scene's play_duration minus the time this plugin has saved. Divided by
// the scene's length it gives an estimated number of earlier plays.
// "Earlier plays" in Stash's own history are the plays dated before the
// start date.

const DAY_MS = 24 * 3600 * 1000;

const toMs = (ts) => new Date(ts).getTime();
const toTs = (ms) => new Date(ms).toISOString().slice(0, 19) + "Z";

/** Stash's play history split at the start date: { earlier, later }, both newest first. */
export function splitHistory(history, installedAt) {
  const start = toMs(installedAt);
  const sorted = [...(history || [])].filter((h) => Number.isFinite(toMs(h))).sort((a, b) => toMs(b) - toMs(a));
  return {
    earlier: sorted.filter((h) => toMs(h) < start),
    later: sorted.filter((h) => toMs(h) >= start),
  };
}

export function estimatePlays(seconds, length, rounding = "nearest") {
  if (!(length > 0) || !(seconds > 0)) return 0;
  const x = seconds / length;
  if (rounding === "down") return Math.floor(x + 1e-9);
  if (rounding === "up") return Math.ceil(x - 1e-9);
  return Math.round(x);
}

/**
 * One row per scene with play data:
 * { id, title, length, earlierSeconds, earlierPlays, estimate, change, skipped }.
 * earlierPlays is the count before any replacement (originals[id] when the
 * scene was replaced). skipped: no length, or no earlier play time with
 * skipWithoutTime on; such scenes keep their current count.
 */
export function planEstimates(scenes, plugin, settings) {
  const { installedAt, scenes: tracked = {}, originals = {} } = plugin;
  const { rounding = "nearest", skipWithoutTime = true } = settings || {};
  const rows = [];
  for (const s of scenes) {
    const length = Number(s.files?.[0]?.duration) || 0;
    const own = Number(tracked[s.id]?.s) || 0;
    const earlierSeconds = Math.max(0, (Number(s.play_duration) || 0) - own);
    const inStash = splitHistory(s.play_history, installedAt).earlier.length;
    const earlierPlays = originals[s.id] != null ? originals[s.id] : inStash;
    if (!earlierSeconds && !earlierPlays) continue;
    const skipped = !(length > 0) || (skipWithoutTime && !earlierSeconds);
    const estimate = skipped ? earlierPlays : estimatePlays(earlierSeconds, length, rounding);
    rows.push({
      id: String(s.id),
      title: s.title || s.files?.[0]?.basename || "Scene " + s.id,
      length,
      earlierSeconds,
      earlierPlays,
      inStash,
      estimate,
      change: estimate - earlierPlays,
      skipped,
    });
  }
  return rows;
}

export function planTotals(rows) {
  const used = rows.filter((r) => !r.skipped);
  return {
    scenes: rows.length,
    estimated: used.length,
    skipped: rows.length - used.length,
    changed: used.filter((r) => r.change !== 0).length,
    earlierSeconds: used.reduce((a, r) => a + r.earlierSeconds, 0),
    earlierPlays: rows.reduce((a, r) => a + r.earlierPlays, 0),
    estimatedPlays: rows.reduce((a, r) => a + r.estimate, 0),
  };
}

/**
 * Earlier play history with `count` entries, built from the original earlier
 * history (newest first). Fewer: the newest entries stay. More: extra
 * entries go one second apart before the oldest earlier play, or before the
 * fallback time (the scene's creation, at the latest a day before the start
 * date), so they stay earlier plays.
 */
export function earlierHistory(original, count, fallback, installedAt) {
  const kept = original.slice(0, count);
  if (kept.length >= count) return kept;
  const latestAllowed = toMs(installedAt) - DAY_MS;
  let base = kept.length ? toMs(kept[kept.length - 1]) : Math.min(toMs(fallback) || latestAllowed, latestAllowed);
  if (!Number.isFinite(base)) base = latestAllowed;
  const out = [...kept];
  for (let i = out.length; i < count; i++) {
    base -= 1000;
    out.push(toTs(base));
  }
  return out;
}

export function sameHistory(a, b) {
  if (a.length !== b.length) return false;
  const x = [...a].map(toMs).sort();
  const y = [...b].map(toMs).sort();
  return x.every((v, i) => v === y[i]);
}
