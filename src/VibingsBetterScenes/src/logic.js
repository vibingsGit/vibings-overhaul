// Pure helpers of the player features (no DOM, tested in node).

// ---------------------------------------------------------------- Chapters

/** The scene's markers as chapters, sorted: [{ start, end, title, marker }]. */
export function chapters(markers, duration) {
  const list = [...(markers || [])]
    .filter((m) => Number.isFinite(m.seconds) && m.seconds >= 0 && (!duration || m.seconds < duration))
    .sort((a, b) => a.seconds - b.seconds);
  return list.map((m, i) => ({
    start: m.seconds,
    end: i + 1 < list.length ? list[i + 1].seconds : duration || m.seconds,
    title: m.title || m.primary_tag?.name || "",
    marker: m,
  }));
}

/** The chapter playing at t, or null before the first marker. */
export function chapterAt(list, t) {
  let found = null;
  for (const c of list) if (t >= c.start) found = c;
  return found;
}

// ---------------------------------------------------------------- Most watched part

/**
 * Start time of the most watched part from Vibings Scene Heatmap's bins
 * (watched seconds per equal part of the video), smoothed over `radius`
 * bins. null when too little has been watched to tell.
 */
export function hottestTime(bins, duration, { radius = 3, minWatched = 20, lead = 2 } = {}) {
  if (!Array.isArray(bins) || !bins.length || !(duration > 0)) return null;
  const total = bins.reduce((a, b) => a + (b || 0), 0);
  if (total < minWatched) return null;
  let best = -1;
  let bestAt = 0;
  for (let i = 0; i < bins.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(bins.length - 1, i + radius); j++) {
      const w = radius + 1 - Math.abs(i - j);
      sum += (bins[j] || 0) * w;
      n += w;
    }
    const v = sum / n;
    if (v > best) { best = v; bestAt = i; }
  }
  // Start a moment before the peak's part so it is not missed.
  return Math.max(0, (bestAt / bins.length) * duration - lead);
}

// ---------------------------------------------------------------- Loudness

/** Gain that brings a measured level (dBFS) to the target, limited to ±12 dB. */
export function normalizeGain(levelDb, targetDb = -20, maxDb = 12) {
  if (!Number.isFinite(levelDb) || levelDb < -60) return 1;
  const db = Math.max(-maxDb, Math.min(maxDb, targetDb - levelDb));
  return Math.pow(10, db / 20);
}

/** Running loudness: an average of the power of non-silent samples, in dBFS. */
export function loudnessMeter(window = 60) {
  const samples = [];
  return {
    add(rms) {
      if (!(rms > 0.003)) return; // silence does not change the level
      samples.push(rms * rms);
      if (samples.length > window) samples.shift();
    },
    get db() {
      if (samples.length < 5) return null;
      const power = samples.reduce((a, b) => a + b, 0) / samples.length;
      return 10 * Math.log10(power);
    },
    reset() { samples.length = 0; },
  };
}

// ---------------------------------------------------------------- Queues

/** The play order shown in the queue tab: the current scene, up next, then the rest of Stash's queue. */
export function playOrder(currentId, upNext, queueScenes) {
  const ids = (queueScenes || []).map((s) => String(s.id));
  const cur = String(currentId);
  const i = ids.indexOf(cur);
  const up = (upNext || []).map(String).filter((id) => id !== cur);
  const upSet = new Set(up);
  const before = i >= 0 ? ids.slice(0, i) : [];
  const after = (i >= 0 ? ids.slice(i + 1) : ids).filter((id) => !upSet.has(id));
  const seen = new Set();
  return [...before, cur, ...up, ...after].filter((id) => !seen.has(id) && seen.add(id));
}

/** Link that opens a list of scenes as Stash's queue, starting at `start`. */
export function queueLink(ids, start = 0) {
  const list = (ids || []).map(String);
  if (!list.length) return null;
  const params = new URLSearchParams();
  for (const id of list) params.append("qs", id);
  params.set("continue", "true");
  return "/scenes/" + list[Math.min(Math.max(0, start), list.length - 1)] + "?" + params.toString();
}

// ---------------------------------------------------------------- Sleep timer

/** Seconds left of a sleep timer, or null. */
export function sleepLeft(sleep, now = Date.now()) {
  if (!sleep?.until) return null;
  return Math.max(0, Math.round((sleep.until - now) / 1000));
}
