// Formatting and parsing helpers, kept free of the DOM so they can be tested.

/** Seconds -> 4:05 or 1:02:03. */
export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
}

/** Seconds -> "1 h 05 min", "4 min", "35 s". */
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return s + " s";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
}

export function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + " " + units[i];
}

export function fmtAgo(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  if (s < 86400 * 30) return Math.round(s / 86400) + " d ago";
  if (s < 86400 * 365) return Math.round(s / (86400 * 30)) + " mo ago";
  return Math.round(s / (86400 * 365)) + " y ago";
}

export const basename = (p) => (p ? String(p).split(/[/\\]/).pop() : "");

export function sceneTitle(scene) {
  if (!scene) return "";
  return scene.title || basename(scene.files?.[0]?.path) || "Scene " + scene.id;
}

/** Age in whole years from a yyyy-mm-dd birthdate, or null. */
export function age(birthdate, now = new Date()) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return null;
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 150 ? a : null;
}

// ---------------------------------------------------------------- Thumbnail sprites

/** WebVTT sprite track -> [{ start, end, x, y, w, h }]. */
export function parseSpriteVtt(text) {
  const cues = [];
  const timeRe = /(\d+):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})\.(\d{3})/;
  const shortRe = /(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/;
  const xywhRe = /#xywh=(\d+),(\d+),(\d+),(\d+)/;
  for (const block of String(text || "").split(/\r?\n\r?\n+/)) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let start = null, end = null, box = null;
    for (const line of lines) {
      const m = line.match(timeRe);
      const s = !m && line.match(shortRe);
      if (m) {
        start = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
        end = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
      } else if (s) {
        start = +s[1] * 60 + +s[2] + +s[3] / 1000;
        end = +s[4] * 60 + +s[5] + +s[6] / 1000;
      } else if (xywhRe.test(line)) {
        const x = line.match(xywhRe);
        box = { x: +x[1], y: +x[2], w: +x[3], h: +x[4] };
      }
    }
    if (start != null && box) cues.push({ start, end, ...box });
  }
  return cues;
}

/** The cue shown at time t (binary search; cues are in time order). */
export function cueAt(cues, t) {
  if (!cues?.length || !Number.isFinite(t)) return null;
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < cues[mid].start) hi = mid - 1;
    else if (t >= cues[mid].end) lo = mid + 1;
    else return cues[mid];
  }
  return cues[Math.max(0, Math.min(cues.length - 1, hi))];
}

// ---------------------------------------------------------------- Recommendations

/**
 * Scores candidate scenes against the current one: shared performers count
 * most, then studio, then tags (weights can be changed); rating and Os add
 * a little. Returns the
 * candidates with a score, best first, without the current scene.
 */
export function scoreScenes(current, candidates, weights = {}) {
  const wp = weights.performers ?? 5;
  const wt = weights.tags ?? 1;
  const ws = weights.studio ?? 3;
  const performers = new Set((current.performers || []).map((p) => String(p.id)));
  const tags = new Set((current.tags || []).map((t) => String(t.id)));
  const studio = current.studio?.id ? String(current.studio.id) : null;
  const best = new Map();
  for (const s of candidates) {
    if (!s || String(s.id) === String(current.id)) continue;
    let score = 0;
    for (const p of s.performers || []) if (performers.has(String(p.id))) score += wp;
    for (const t of s.tags || []) if (tags.has(String(t.id))) score += wt;
    if (studio && String(s.studio?.id) === studio) score += ws;
    score += (s.rating100 || 0) / 50;
    score += Math.min(s.o_counter || 0, 5) * 0.8;
    const prev = best.get(String(s.id));
    if (!prev || score > prev.score) best.set(String(s.id), { scene: s, score });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------- Activity grid

const dayKey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/**
 * Days of the last `weeks` weeks (local time, weeks start on Monday), oldest
 * first, as columns of 7: [[{ key, plays, os, future }]].
 */
export function activityWeeks(playHistory, oHistory, weeks = 26, today = new Date()) {
  const count = (list) => {
    const m = new Map();
    for (const ts of list || []) {
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime())) m.set(dayKey(d), (m.get(dayKey(d)) || 0) + 1);
    }
    return m;
  };
  const plays = count(playHistory);
  const os = count(oHistory);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monday = new Date(end);
  monday.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const start = new Date(monday);
  start.setDate(monday.getDate() - (weeks - 1) * 7);
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      const key = dayKey(day);
      col.push({ key, plays: plays.get(key) || 0, os: os.get(key) || 0, future: day > end });
    }
    out.push(col);
  }
  return out;
}
