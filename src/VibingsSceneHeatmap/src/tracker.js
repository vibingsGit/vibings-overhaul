// Records which parts of a video are watched and sends them to the backend
// in batches (every 30 s, on pause, at the end, on a new video and when the
// page is hidden).

import { LOG, backend } from "./api.js";
import { SegmentRecorder } from "./heat.js";
import { addLocal } from "./store.js";
import { getSettings } from "./settings.js";

const FLUSH_MS = 30 * 1000;
const EVENTS = ["timeupdate", "pause", "seeking", "ratechange", "ended", "loadstart", "emptied"];

let pending = {}; // id -> { d, segments }

async function send({ keepalive = false } = {}) {
  const batch = pending;
  if (!Object.keys(batch).length) return;
  pending = {};
  try {
    await backend("record", { scenes: batch }, { keepalive });
  } catch (e) {
    console.warn(LOG, "could not store watched parts, retrying later:", e.message);
    for (const [id, v] of Object.entries(batch)) queue(id, v.d, v.segments);
  }
}

function queue(id, d, segments) {
  if (!segments.length || !(d > 0)) return;
  const row = (pending[id] ||= { d, segments: [] });
  row.d = d;
  row.segments.push(...segments);
}

setInterval(() => send(), FLUSH_MS);
window.addEventListener("pagehide", () => send({ keepalive: true }));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") send({ keepalive: true }); });

/** Starts recording a video; getSceneId() names the scene it plays. Returns stop(). */
export function trackVideo(video, getSceneId) {
  const rec = new SegmentRecorder();
  let sceneId = getSceneId();
  let duration = 0; // the scene's length; still known when the next video starts loading

  const collect = () => {
    const segments = rec.take();
    const d = duration;
    if (!sceneId || !segments.length || !(d > 0) || !getSettings().enabled) return;
    queue(sceneId, d, segments);
    addLocal(sceneId, d, segments);
  };

  const onEvent = (e) => {
    if (e.type === "loadstart" || e.type === "emptied") {
      // The open part belongs to the previous video.
      rec.reset();
      collect();
      send();
      sceneId = getSceneId();
      duration = 0;
      return;
    }
    if (Number.isFinite(video.duration) && video.duration > 0) duration = video.duration;
    rec.sample({ t: video.currentTime, wall: performance.now(), paused: video.paused, seeking: video.seeking || e.type === "seeking", rate: video.playbackRate });
    if (e.type === "pause" || e.type === "ended") {
      rec.close();
      collect();
      send();
    }
  };
  const tick = setInterval(collect, 5000); // the curve grows while you watch

  for (const e of EVENTS) video.addEventListener(e, onEvent);
  return () => {
    clearInterval(tick);
    for (const e of EVENTS) video.removeEventListener(e, onEvent);
    rec.close();
    collect();
    send();
  };
}
