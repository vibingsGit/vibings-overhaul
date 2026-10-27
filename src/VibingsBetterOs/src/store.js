// Per-scene O state: Stash's o_history plus the stored details, kept in sync.
// The tracker, the player decorations and the Os tab all read from here.

import { LOG, graphql, backend, normTs } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const scenes = new Map(); // id -> { history, events, duration, loaded, loading, error, flash }
const listeners = new Set();

const EMPTY = { history: [], events: [], duration: null, loaded: false, loading: false, error: null, flash: null };

function emit(id) {
  listeners.forEach((fn) => fn(id));
}

function patch(id, changes) {
  const next = { ...(scenes.get(id) || EMPTY), ...changes };
  scenes.set(id, next);
  emit(id);
  return next;
}

export const getScene = (id) => scenes.get(String(id)) || EMPTY;

export function onScene(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useScene(id) {
  const key = String(id);
  const [state, setState] = React.useState(() => getScene(key));
  React.useEffect(() => {
    setState(getScene(key));
    if (!getScene(key).loaded && !getScene(key).loading) loadScene(key);
    return onScene((changed) => {
      if (changed === key) setState(getScene(key));
      else if (changed === "*") loadScene(key);
    });
  }, [key]);
  return state;
}

/** Stored data changed as a whole (import, restore, reset): reload what is shown. */
export function forgetScenes() {
  scenes.clear();
  emit("*");
}

const hasAll = (history, events) => {
  const set = new Set(history.map(normTs));
  return events.every((e) => set.has(e.at));
};

/** Loads o_history and stored details; drops details whose O is gone. */
export async function loadScene(id) {
  const key = String(id);
  patch(key, { loading: true });
  try {
    const [data, stored] = await Promise.all([
      graphql("query VibingsBetterOsScene($id: ID!) { findScene(id: $id) { id o_history files { duration } } }", { id: key }),
      backend("get_scene", { sceneId: key }),
    ]);
    const scene = data.findScene;
    if (!scene) return patch(key, { ...EMPTY, loaded: true });
    const history = (scene.o_history || []).map(normTs).filter(Boolean);
    let events = stored?.events || [];
    if (!hasAll(history, events)) events = (await backend("sync_scene", { sceneId: key, history })).events;
    return patch(key, { history, events, duration: scene.files?.[0]?.duration || null, loaded: true, loading: false, error: null });
  } catch (e) {
    console.warn(LOG, "could not load scene", key, e.message);
    return patch(key, { loading: false, loaded: true, error: e.message });
  }
}

/** Stash changed the scene's o_history (an O was removed or reset). */
export async function syncHistory(id, history) {
  const key = String(id);
  const norm = (history || []).map(normTs).filter(Boolean);
  const before = getScene(key);
  patch(key, { history: norm });
  if (before.loaded && hasAll(norm, before.events)) return;
  try {
    const out = await backend("sync_scene", { sceneId: key, history: norm });
    patch(key, { events: out.events, loaded: true });
  } catch (e) {
    console.warn(LOG, "could not sync scene", key, e.message);
  }
}

/** An O was added in Stash; flashAt flashes it in the player and the Os tab. */
export function addedO(id, history, flashAt) {
  patch(String(id), { history: (history || []).map(normTs).filter(Boolean), ...(flashAt ? { flash: { at: flashAt, n: Date.now() } } : {}) });
}

export function setEvents(id, events, flashAt) {
  patch(String(id), { events, ...(flashAt ? { flash: { at: flashAt, n: Date.now() } } : {}) });
}

export function setDuration(id, duration) {
  const s = getScene(id);
  if (duration > 0 && s.duration !== duration) patch(String(id), { duration });
}

/** Rows for display, newest first: [{ at, event | null }]. */
export function rows(state) {
  const byAt = new Map(state.events.map((e) => [e.at, e]));
  return [...state.history].sort().reverse().map((at) => ({ at, event: byAt.get(at) || null }));
}
