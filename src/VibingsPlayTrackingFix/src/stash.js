// Reads and writes of Stash's scene play data for the Tools panel: the scenes
// with play data, replacing and restoring earlier plays, and resume points.

import { graphql, backend, updateCache } from "./api.js";
import { splitHistory, earlierHistory, sameHistory } from "./estimate.js";

const SCENE_FIELDS = "id title created_at play_count play_duration play_history resume_time files { basename duration }";
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Every scene with plays or play time. */
export async function scenesWithPlays() {
  const d = await graphql(
    "query VibingsPlayTrackingScenes { findScenes(scene_filter: { play_count: { value: 0, modifier: GREATER_THAN }, OR: { play_duration: { value: 0, modifier: GREATER_THAN } } }, filter: { per_page: -1 }) { scenes { " + SCENE_FIELDS + " } } }"
  );
  return d.findScenes.scenes;
}

/** Scenes by id; missing ids were deleted from Stash. */
export async function scenesById(ids) {
  const out = new Map();
  for (const part of chunks(ids.map(Number), 200)) {
    const d = await graphql(
      "query VibingsPlayTrackingScenesById($ids: [Int!]) { findScenes(scene_ids: $ids, filter: { per_page: -1 }) { scenes { " + SCENE_FIELDS + " } } }",
      { ids: part }
    );
    for (const s of d.findScenes.scenes) out.set(String(s.id), s);
  }
  return out;
}

/** Sets a scene's whole play history in Stash. */
async function writeHistory(id, history) {
  await graphql("mutation VibingsPlayTrackingResetPlays($id: ID!) { sceneResetPlayCount(id: $id) }", { id });
  let result = { count: 0, history: [] };
  if (history.length) {
    const d = await graphql(
      "mutation VibingsPlayTrackingAddPlays($id: ID!, $times: [Timestamp!]) { sceneAddPlay(id: $id, times: $times) { count history } }",
      { id, times: history }
    );
    result = d.sceneAddPlay;
  }
  updateCache(id, {
    play_count: () => result.count,
    play_history: () => result.history,
    last_played_at: () => result.history[0] ?? null,
  });
}

/**
 * Replace mode: each planned scene's earlier plays become its estimate.
 * The original earlier history is stored first so it can be undone.
 * onProgress(done, total). Returns { changed, failed }.
 */
export async function replaceEarlierPlays(rows, installedAt, onProgress) {
  const used = rows.filter((r) => !r.skipped);
  const current = await scenesById(used.map((r) => r.id));
  const stored = await backend("get_originals", { ids: used.map((r) => r.id) });
  const originals = {};
  const work = [];
  for (const r of used) {
    const scene = current.get(r.id);
    if (!scene) continue;
    const { earlier, later } = splitHistory(scene.play_history, installedAt);
    const original = stored[r.id]?.history || earlier;
    const next = [...earlierHistory(original, r.estimate, scene.created_at, installedAt), ...later];
    if (sameHistory(next, scene.play_history || [])) continue;
    if (!stored[r.id]) originals[r.id] = earlier;
    work.push({ id: r.id, next });
  }
  if (Object.keys(originals).length) await backend("save_originals", { scenes: originals });
  let done = 0, failed = 0;
  for (const w of work) {
    try { await writeHistory(w.id, w.next); } catch { failed++; }
    onProgress?.(++done, work.length);
  }
  return { changed: work.length - failed, failed };
}

/** Undo of the replace mode: earlier plays back to the stored originals, later plays kept. */
export async function restoreEarlierPlays(installedAt, onProgress) {
  const stored = await backend("get_originals");
  const ids = Object.keys(stored);
  const current = await scenesById(ids);
  const restored = [];
  let done = 0, failed = 0;
  for (const id of ids) {
    const scene = current.get(id);
    try {
      if (scene) {
        const { later } = splitHistory(scene.play_history, installedAt);
        const next = [...stored[id].history, ...later];
        if (!sameHistory(next, scene.play_history || [])) await writeHistory(id, next);
      }
      restored.push(id); // a deleted scene has nothing left to restore
    } catch {
      failed++;
    }
    onProgress?.(++done, ids.length);
  }
  if (restored.length) await backend("drop_originals", { ids: restored });
  return { restored: restored.length, failed };
}

/** Resume points Stash would never use: at 98 % or later, or past the end. */
export async function staleResumePoints() {
  const d = await graphql(
    "query VibingsPlayTrackingResume { findScenes(scene_filter: { resume_time: { value: 0, modifier: GREATER_THAN } }, filter: { per_page: -1 }) { scenes { id resume_time files { duration } } } }"
  );
  return d.findScenes.scenes.filter((s) => {
    const len = Number(s.files?.[0]?.duration) || 0;
    return len > 0 && (s.resume_time / len) * 100 >= 98;
  }).map((s) => s.id);
}

export async function clearResumePoints(ids, onProgress) {
  let done = 0, failed = 0;
  for (const id of ids) {
    try {
      await graphql("mutation VibingsPlayTrackingClearResume($id: ID!) { sceneResetActivity(id: $id, reset_resume: true, reset_duration: false) }", { id });
      updateCache(id, { resume_time: () => 0 });
    } catch {
      failed++;
    }
    onProgress?.(++done, ids.length);
  }
  return { cleared: ids.length - failed, failed };
}
