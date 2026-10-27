// Dataset loader. Every statistic belongs to a dataset (see datasets.js);
// a view asks for the datasets it shows and renders each card as soon as
// its dataset arrives. Results are kept in memory and in localStorage, so a
// return visit shows the last numbers at once and refreshes them in the
// background when they are older than the cache time.

import { LOG, VERSION, cachedConfig } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const STORAGE_PREFIX = "vibings-stats:";
const defs = new Map(); // name -> { name, label, load(report) }
const state = new Map(); // name -> { data, updatedAt, ms, error, loading, progress }
const inflight = new Map();
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());

export function registerDatasets(list) {
  list.forEach((d) => defs.set(d.name, d));
}

export const datasetNames = () => [...defs.keys()];
export const datasetLabel = (name) => defs.get(name)?.label || name;

function readStored(name) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_PREFIX + name));
    if (raw && raw.v === VERSION) return raw;
  } catch { /* storage unavailable or invalid */ }
  return null;
}

function writeStored(name, entry) {
  try {
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify({ v: VERSION, data: entry.data, updatedAt: entry.updatedAt, ms: entry.ms }));
  } catch (e) {
    console.warn(LOG, "could not cache", name, e.message); // e.g. quota exceeded: memory only
  }
}

function get(name) {
  if (!state.has(name)) {
    const stored = readStored(name);
    state.set(name, stored ? { data: stored.data, updatedAt: stored.updatedAt, ms: stored.ms, cached: true } : {});
  }
  return state.get(name);
}

function set(name, patch) {
  state.set(name, { ...get(name), ...patch });
  emit();
}

const isFresh = (entry) => {
  const minutes = cachedConfig().cacheMinutes;
  return entry.updatedAt && Date.now() - entry.updatedAt < minutes * 60000;
};

/** Load a dataset unless a fresh copy exists (or `force`). Resolves when done. */
export function load(name, { force = false } = {}) {
  const def = defs.get(name);
  if (!def) return Promise.reject(new Error(`unknown dataset ${name}`));
  const entry = get(name);
  if (!force && entry.data && isFresh(entry)) return Promise.resolve(entry.data);
  if (inflight.has(name)) return inflight.get(name);
  const t0 = performance.now();
  set(name, { loading: true, error: null, progress: null });
  const report = (done, total) => set(name, { progress: { done, total } });
  const p = def.load(report)
    .then((data) => {
      const done = { data, updatedAt: Date.now(), ms: Math.round(performance.now() - t0), loading: false, progress: null, cached: false };
      set(name, done);
      writeStored(name, done);
      return data;
    })
    .catch((e) => {
      console.warn(LOG, "dataset failed", name, e);
      set(name, { loading: false, error: e.message || String(e), progress: null });
      throw e;
    })
    .finally(() => inflight.delete(name));
  inflight.set(name, p);
  return p;
}

/** Load every dataset one after another, quietly, so other views are ready when opened. */
export async function prefetchAll() {
  for (const name of defs.keys()) {
    try { await load(name); } catch { /* shown where the dataset is used */ }
  }
}

export function clearCache() {
  for (const name of defs.keys()) {
    try { localStorage.removeItem(STORAGE_PREFIX + name); } catch { /* ignore */ }
  }
  state.clear();
  emit();
}

/** Snapshot of every dataset for the status view. */
export function datasetStates() {
  return [...defs.keys()].map((name) => ({ name, label: datasetLabel(name), ...get(name) }));
}

function useStore() {
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
}

/**
 * { data, loading, error, progress, updatedAt } for a dataset; starts
 * loading it when needed. Stale data stays visible while it refreshes.
 */
export function useDataset(name) {
  useStore();
  React.useEffect(() => { load(name).catch(() => {}); }, [name]);
  return get(name);
}

export function useAllDatasets() {
  useStore();
  return datasetStates();
}

export function refreshAll() {
  return Promise.allSettled([...defs.keys()].map((n) => load(n, { force: true })));
}
