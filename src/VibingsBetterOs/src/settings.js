// Settings live in the backend (so every device shares them); a localStorage
// mirror makes them available synchronously before the backend answers.

import { LOG, backend } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const MIRROR_KEY = "vibings-better-os:settings";

export const DEFAULT_SETTINGS = {
  recordPosition: true,
  imageSessions: true,
  player: { button: true, markers: true, popup: true },
  backup: { auto: true, intervalHours: 24, keep: 10 },
  ui: {},
};

function withDefaults(s) {
  const src = s && typeof s === "object" ? s : {};
  return {
    ...DEFAULT_SETTINGS,
    ...src,
    player: { ...DEFAULT_SETTINGS.player, ...(src.player || {}) },
    backup: { ...DEFAULT_SETTINGS.backup, ...(src.backup || {}) },
  };
}

function readMirror() {
  try { return withDefaults(JSON.parse(localStorage.getItem(MIRROR_KEY))); } catch { return withDefaults(null); }
}

let current = readMirror();
const listeners = new Set();

function set(next) {
  current = withDefaults(next);
  try { localStorage.setItem(MIRROR_KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn(current));
}

export const getSettings = () => current;

export async function loadSettings() {
  try {
    set(await backend("get_settings"));
  } catch (e) {
    console.warn(LOG, "could not load settings, using the last known ones:", e.message);
  }
  return current;
}

/** Partial save: { player: { markers: false } } keeps the other player settings. */
export async function saveSettings(partial) {
  set(await backend("save_settings", { settings: partial }));
  return current;
}

export function onSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  const [s, setS] = React.useState(current);
  React.useEffect(() => onSettings(setS), []);
  return s;
}
