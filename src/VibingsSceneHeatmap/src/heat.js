// The curve and the watched segments, kept free of the DOM so they can be tested.

// How much later than the wall clock the video may be and still count as
// playing (same rule as Vibings Play Tracking Fix).
const SLACK_FACTOR = 1.5;
const SLACK_SECONDS = 0.35;

/**
 * Builds watched segments from samples of a playing video. A pause, a seek or
 * a jump (backward, or forward faster than the wall clock allows) closes the
 * current segment.
 */
export class SegmentRecorder {
  constructor() {
    this.last = null; // { t, wall }
    this.open = null; // [start, end]
    this.done = [];
  }

  sample({ t, wall, paused = false, seeking = false, rate = 1 }) {
    if (!Number.isFinite(t)) return;
    const last = this.last;
    this.last = { t, wall };
    if (!last || paused || seeking) return this.close();
    const dt = t - last.t;
    const allowed = Math.max(0, (wall - last.wall) / 1000) * Math.max(rate || 1, 0.0625) * SLACK_FACTOR + SLACK_SECONDS;
    if (dt <= 0 || dt > allowed) return this.close();
    if (this.open && Math.abs(this.open[1] - last.t) < 0.001) this.open[1] = t;
    else {
      this.close();
      this.open = [last.t, t];
    }
  }

  reset() {
    this.close();
    this.last = null;
  }

  close() {
    if (this.open && this.open[1] - this.open[0] >= 0.25) this.done.push(this.open.map((x) => Math.round(x * 100) / 100));
    this.open = null;
  }

  /** Finished segments (and the open one, which continues), cleared. */
  take() {
    const out = [...this.done];
    this.done = [];
    if (this.open && this.open[1] - this.open[0] >= 0.25) {
      out.push(this.open.map((x) => Math.round(x * 100) / 100));
      this.open = [this.open[1], this.open[1]];
    }
    return out;
  }
}

/** Adds segments to bins locally (the same spreading the backend does). */
export function addSegments(bins, duration, segments) {
  const out = [...bins];
  if (!(duration > 0)) return out;
  const width = duration / out.length;
  for (const [a, b] of segments) {
    const start = Math.max(0, a), end = Math.min(duration, b);
    for (let i = Math.floor(start / width); i < out.length && i * width < end; i++) {
      const lo = Math.max(start, i * width), hi = Math.min(end, (i + 1) * width);
      if (hi > lo) out[i] += hi - lo;
    }
  }
  return out;
}

/** Moving average over `radius` bins on each side, scaled so the highest value is 1. */
export function curveValues(bins, radius = 3) {
  if (!bins?.length) return [];
  const sm = bins.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(bins.length - 1, i + radius); j++) {
      const w = radius + 1 - Math.abs(i - j);
      sum += bins[j] * w;
      n += w;
    }
    return sum / n;
  });
  const max = Math.max(...sm);
  return max > 0 ? sm.map((v) => v / max) : sm.map(() => 0);
}

/** A closed SVG path of the curve over a w × h box (values 0…1). */
export function curvePath(values, w, h, floor = 0.06) {
  if (!values.length) return "";
  const pts = values.map((v, i) => [values.length === 1 ? w / 2 : (i / (values.length - 1)) * w, h - (floor + v * (1 - floor)) * h]);
  let d = "M0," + h + " L" + pts[0][0].toFixed(1) + "," + pts[0][1].toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += " C" + cx.toFixed(1) + "," + y0.toFixed(1) + " " + cx.toFixed(1) + "," + y1.toFixed(1) + " " + x1.toFixed(1) + "," + y1.toFixed(1);
  }
  return d + " L" + w + "," + h + " Z";
}
