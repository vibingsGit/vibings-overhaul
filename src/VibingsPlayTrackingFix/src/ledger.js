// This plugin's share of each scene's play time and plays, collected here
// and sent to the backend in batches. Earlier (pre-plugin) play time is a
// scene's play_duration minus this share.

import { LOG, backend } from "./api.js";

const FLUSH_MS = 60 * 1000;

let pending = {}; // { sceneId: { s, p } }
let timer = null;

export function record(sceneId, seconds = 0, plays = 0) {
  const row = (pending[sceneId] ||= { s: 0, p: 0 });
  row.s += seconds;
  row.p += plays;
  if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}

export async function flush({ keepalive = false } = {}) {
  clearTimeout(timer);
  timer = null;
  const batch = pending;
  if (!Object.keys(batch).length) return;
  pending = {};
  try {
    await backend("record", { scenes: batch }, { keepalive });
  } catch (e) {
    console.warn(LOG, "could not store this plugin's play time, retrying later:", e?.message || e);
    for (const [id, row] of Object.entries(batch)) record(id, row.s, row.p);
  }
}

window.addEventListener("pagehide", () => flush({ keepalive: true }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush({ keepalive: true });
});
