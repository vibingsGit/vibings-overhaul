// Per-scene heat: the stored bins plus what was watched on this page and not
// sent yet, so the curve grows while you watch.

import { LOG, backend } from "./api.js";
import { addSegments } from "./heat.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const BINS = 200;
const scenes = new Map(); // id -> { bins, d, w, loaded, loading }
const listeners = new Set();
const EMPTY = { bins: null, d: 0, w: 0, loaded: false, loading: false };

function emit(id) {
  listeners.forEach((fn) => fn(id));
}

export const getHeat = (id) => scenes.get(String(id)) || EMPTY;

export function onHeat(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function loadHeat(id) {
  const key = String(id);
  const cur = getHeat(key);
  if (cur.loading) return cur;
  scenes.set(key, { ...cur, loading: true });
  try {
    const out = await backend("get_scene", { sceneId: key });
    // Keep what was added locally while loading.
    const local = getHeat(key);
    const bins = out.bins || new Array(BINS).fill(0);
    scenes.set(key, { bins: local.pending ? bins.map((v, i) => v + (local.pending[i] || 0)) : bins, d: out.d, w: out.w, loaded: true, loading: false, pending: local.pending });
  } catch (e) {
    console.warn(LOG, "could not load the heatmap:", e.message);
    scenes.set(key, { ...getHeat(key), loading: false });
  }
  emit(key);
  return getHeat(key);
}

/** Adds just-watched segments to the shown curve (they are sent separately). */
export function addLocal(id, duration, segments) {
  const key = String(id);
  const cur = getHeat(key);
  const base = cur.bins || new Array(BINS).fill(0);
  const added = addSegments(new Array(BINS).fill(0), duration, segments);
  scenes.set(key, {
    ...cur,
    d: cur.d || duration,
    w: (cur.w || 0) + added.reduce((a, b) => a + b, 0),
    bins: base.map((v, i) => v + added[i]),
    pending: cur.loaded ? null : (cur.pending || new Array(BINS).fill(0)).map((v, i) => v + added[i]),
  });
  emit(key);
}

export function forgetHeat() {
  scenes.clear();
  emit("*");
}

export function useHeat(id) {
  const key = id == null ? null : String(id);
  const [state, setState] = React.useState(() => (key ? getHeat(key) : EMPTY));
  React.useEffect(() => {
    if (!key) return undefined;
    setState(getHeat(key));
    if (!getHeat(key).loaded) loadHeat(key);
    return onHeat((changed) => {
      if (changed === key) setState(getHeat(key));
      else if (changed === "*") loadHeat(key);
    });
  }, [key]);
  return state;
}
