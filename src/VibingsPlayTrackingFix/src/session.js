// The counting rules, kept free of the DOM so they can be tested.
//
// Watched time is how far the video moves forward while it plays. Each
// sample is compared with the previous one: a paused or seeking video, a
// backward jump and a forward jump larger than the elapsed wall time allows
// (a skip on the timeline) add nothing. Playing at 2x counts the video time
// that went by, so a 10-minute video watched at 2x counts as 10 minutes.

export const DEFAULT_MIN_PERCENT = 25;
export const SYNC_EVERY = 10; // seconds of new watched time between saves
export const LOOP_EDGE = 3; // at most this many seconds from the end/start make a jump a loop

// How much later than the wall clock the video may be and still count as playing:
// timeupdate events are irregular and a tab in the background gets fewer of them.
const SLACK_FACTOR = 1.5;
const SLACK_SECONDS = 0.35;

export class WatchClock {
  constructor() {
    this.last = null; // { t, wall }
  }

  reset(t = null, wall = 0) {
    this.last = t == null ? null : { t, wall };
  }

  /**
   * Seconds of video played since the previous sample.
   * sample: { t, wall (ms), paused, seeking, rate }
   */
  sample({ t, wall, paused = false, seeking = false, rate = 1 }) {
    if (!Number.isFinite(t)) return 0;
    const last = this.last;
    this.last = { t, wall };
    if (!last || paused || seeking) return 0;
    const dt = t - last.t;
    if (dt <= 0) return 0;
    const elapsed = Math.max(0, (wall - last.wall) / 1000);
    const allowed = elapsed * Math.max(rate || 1, 0.0625) * SLACK_FACTOR + SLACK_SECONDS;
    return dt > allowed ? 0 : dt;
  }
}

/** Seconds from the end/start that count as "at the end" / "at the start": 3 s, less for short videos. */
export function loopEdge(duration) {
  return Math.min(LOOP_EDGE, Math.max(0.5, duration * 0.15));
}

/** A jump from the last seconds of the video to its first seconds: the video looped or started over. */
export function isLoop(fromT, toT, duration) {
  if (!(duration > 1) || !Number.isFinite(fromT) || !Number.isFinite(toT)) return false;
  const edge = loopEdge(duration);
  return fromT >= duration - edge && toT <= edge && toT < fromT;
}

/**
 * A new viewing starts at a jump back to the start: from the end (a loop or
 * replay), or from anywhere once this viewing has already counted its play.
 */
export function startsOver(fromT, toT, duration, counted) {
  if (isLoop(fromT, toT, duration)) return true;
  if (!counted || !(duration > 1) || !Number.isFinite(fromT) || !Number.isFinite(toT)) return false;
  const edge = loopEdge(duration);
  return toT <= edge && fromT > edge * 2;
}

/** Play threshold in seconds for a video; at least one second. */
export function playThreshold(duration, minPercent = DEFAULT_MIN_PERCENT) {
  if (!(duration > 0)) return Infinity;
  const pct = Number.isFinite(minPercent) && minPercent >= 0 ? Math.min(minPercent, 100) : DEFAULT_MIN_PERCENT;
  return Math.max(1, (duration * pct) / 100);
}

/** Resume point to save: Stash's rule, a video watched to 98 % starts from the beginning. */
export function resumeTime(t, duration) {
  if (!Number.isFinite(t) || t < 0) return 0;
  if (duration > 0 && (t / duration) * 100 >= 98) return 0;
  return t;
}

/**
 * One viewing of one scene. add() returns what to do now:
 * { countPlay: true } once the threshold is reached, { save: true } when
 * enough unsaved time has gathered.
 */
export class PlaySession {
  constructor(sceneId, minPercent = DEFAULT_MIN_PERCENT) {
    this.sceneId = String(sceneId);
    this.minPercent = minPercent;
    this.watched = 0;
    this.unsaved = 0;
    this.counted = false;
  }

  add(seconds, duration) {
    const out = { countPlay: false, save: false };
    if (!(seconds > 0)) return out;
    this.watched += seconds;
    this.unsaved += seconds;
    if (!this.counted && this.watched >= playThreshold(duration, this.minPercent)) {
      this.counted = true;
      out.countPlay = true;
    }
    if (this.unsaved >= SYNC_EVERY) out.save = true;
    return out;
  }

  /** Unsaved seconds, cleared. */
  take() {
    const s = this.unsaved;
    this.unsaved = 0;
    return s;
  }

  /** Puts seconds back after a failed save. */
  giveBack(seconds) {
    this.unsaved += seconds;
  }
}
