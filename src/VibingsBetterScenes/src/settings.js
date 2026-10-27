// Settings are kept in Stash's own plugin configuration (on the server, so
// every device shares them); a localStorage mirror makes them available at
// once. Volume and the last below-player view are per device only.

import { LOG, PLUGIN_ID, graphql } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const MIRROR_KEY = "vibings-better-scenes:settings";
const DEVICE_KEY = "vibings-better-scenes:device";

export const DEFAULT_SETTINGS = {
  enabled: true, // use the Better Scenes page instead of Stash's
  player: {
    autoplay: false, // start playing when a scene opens
    controlsHide: 2.5, // seconds without movement before the controls hide while playing
    seekStep: 10, // arrow keys and double tap, seconds
    doubleTap: true, // double tap the left/right side to seek on touch screens
    gestures: true, // touch: swipe sideways for the next/previous scene, up/down in fullscreen for the volume
    rotate: true, // touch: turn the screen to the video's orientation in fullscreen
    ambient: false, // the video's colours glow around the player
    normalize: false, // even out the loudness of scenes (Web Audio)
    miniPlayer: true, // keep playing in a small player when leaving the scene page
    startHottest: false, // start from the most watched part (Vibings Scene Heatmap) when there is no resume point
  },
  timeline: {
    thumbnails: true, // sprite preview while hovering the timeline
    markers: true, // scene markers on the timeline
    os: true, // O positions on the timeline (Vibings Better Os)
    heatmap: true, // interactive heatmap under the timeline when the scene has one
    mostWatched: true, // curve of the most watched parts (Vibings Scene Heatmap)
    chapters: true, // markers split the timeline into chapters
  },
  layout: {
    theater: false, // player full width, side panel below
    below: true, // views under the player
  },
  queue: {
    repeat: false, // start the queue again after its last scene
    shuffle: false, // the next scene is a random scene of the queue
  },
  cards: {
    preview: true, // play the scene's preview while hovering a card (moving the pointer scrubs it)
  },
  recommend: {
    hideWatched: false, // leave out scenes that have been played
    performers: 5, // weight of each shared performer
    studio: 3, // weight of the same studio
    tags: 1, // weight of each shared tag
  },
};

function merge(base, raw) {
  const out = { ...base };
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(base)) {
    if (v && typeof v === "object") out[k] = merge(v, raw[k]);
    else if (typeof raw[k] === typeof v) out[k] = raw[k];
  }
  return out;
}

const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

let current = merge(DEFAULT_SETTINGS, read(MIRROR_KEY, null));
const listeners = new Set();
// The plugin's configuration holds { settings, library } as JSON strings and
// is written as a whole, so both are kept here.
let config = {};
let loaded = null;

function set(next) {
  current = merge(DEFAULT_SETTINGS, next);
  write(MIRROR_KEY, current);
  listeners.forEach((fn) => fn(current));
}

export const getSettings = () => current;

export function loadSettings() {
  loaded = (async () => {
    try {
      const data = await graphql("query VibingsBetterScenesConfig($ids: [ID!]) { configuration { plugins(include: $ids) } }", { ids: [PLUGIN_ID] });
      config = { ...(data?.configuration?.plugins?.[PLUGIN_ID] || {}) };
      if (config.settings) set(JSON.parse(config.settings));
      setLibrary(parseLibrary(config.library));
    } catch (e) {
      console.warn(LOG, "could not load settings, using the last known ones:", e.message);
    }
    return current;
  })();
  return loaded;
}

async function writeConfig(changes) {
  if (loaded) await loaded; // never write over values not read yet
  const input = { ...config, ...changes };
  await graphql(
    "mutation VibingsBetterScenesConfigure($id: ID!, $input: Map!) { configurePlugin(plugin_id: $id, input: $input) }",
    { id: PLUGIN_ID, input }
  );
  config = input;
}

/** Partial save: { player: { autoplay: true } } keeps the other player settings. */
export async function saveSettings(partial) {
  const next = merge(DEFAULT_SETTINGS, deepAssign(JSON.parse(JSON.stringify(current)), partial));
  await writeConfig({ settings: JSON.stringify(next) });
  set(next);
  return current;
}

// ---------------------------------------------------------------- Library (saved queues, filter presets, filters per scene)

const LIBRARY_MIRROR = "vibings-better-scenes:library";
const EMPTY_LIBRARY = { queues: [], presets: [], sceneFilters: {} };
const MAX_QUEUES = 50;
const MAX_QUEUE_SCENES = 500;
const MAX_SCENE_FILTERS = 2000;

function parseLibrary(raw) {
  let v = raw;
  try { if (typeof raw === "string") v = JSON.parse(raw); } catch { v = null; }
  if (!v || typeof v !== "object") return { ...EMPTY_LIBRARY };
  return {
    queues: Array.isArray(v.queues) ? v.queues.filter((q) => q && typeof q.name === "string" && Array.isArray(q.ids)) : [],
    presets: Array.isArray(v.presets) ? v.presets.filter((p) => p && typeof p.name === "string") : [],
    sceneFilters: v.sceneFilters && typeof v.sceneFilters === "object" ? v.sceneFilters : {},
  };
}

let library = parseLibrary(read(LIBRARY_MIRROR, null));
const libraryListeners = new Set();

function setLibrary(next) {
  library = next;
  write(LIBRARY_MIRROR, library);
  libraryListeners.forEach((fn) => fn(library));
}

export const getLibrary = () => library;

/** change(library) returns the new library; it is saved on the server. */
export async function updateLibrary(change) {
  if (loaded) await loaded;
  const next = parseLibrary(change(JSON.parse(JSON.stringify(library))));
  next.queues = next.queues.slice(0, MAX_QUEUES).map((q) => ({ ...q, ids: q.ids.map(String).slice(0, MAX_QUEUE_SCENES) }));
  const keys = Object.keys(next.sceneFilters);
  if (keys.length > MAX_SCENE_FILTERS) for (const k of keys.slice(0, keys.length - MAX_SCENE_FILTERS)) delete next.sceneFilters[k];
  await writeConfig({ library: JSON.stringify(next) });
  setLibrary(next);
  return next;
}

export function useLibrary() {
  const [l, setL] = React.useState(library);
  React.useEffect(() => {
    libraryListeners.add(setL);
    return () => libraryListeners.delete(setL);
  }, []);
  return l;
}

function deepAssign(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) target[k] = deepAssign(target[k] || {}, v);
    else target[k] = v;
  }
  return target;
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

// ---------------------------------------------------------------- This device

const DEVICE_DEFAULTS = { volume: 1, muted: false, below: "next", sideTab: "overview", activityGrid: true, markerTags: [] };
let device = { ...DEVICE_DEFAULTS, ...read(DEVICE_KEY, {}) };

export const getDevice = () => device;
export function setDevice(partial) {
  device = { ...device, ...partial };
  write(DEVICE_KEY, device);
}
