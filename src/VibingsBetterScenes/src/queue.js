// "Up next": scenes added with Play next / Add to queue, kept for this browser
// tab. They play before the rest of Stash's own queue (the scene list the
// scene was opened from), each once.

import { toast } from "./store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const KEY = "vibings-better-scenes:up-next";
const listeners = new Set();

export function getUpNext() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function setUpNext(ids) {
  try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  listeners.forEach((fn) => fn(ids));
}

export function playNext(id) {
  setUpNext([String(id), ...getUpNext().filter((x) => x !== String(id))]);
  toast("Plays next");
}

export function addToQueue(id) {
  setUpNext([...getUpNext().filter((x) => x !== String(id)), String(id)]);
  toast("Added to up next");
}

export function removeFromQueue(id) {
  setUpNext(getUpNext().filter((x) => x !== String(id)));
}

export function moveInQueue(id, delta) {
  const ids = getUpNext();
  const i = ids.indexOf(String(id));
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  setUpNext(ids);
}

export const clearQueue = () => setUpNext([]);

/** New up next order after dropping `id` at position `index` of [up next…, queue…]. */
export function dropOrder(upNext, id, index) {
  const without = upNext.filter((x) => x !== id);
  const from = upNext.indexOf(id);
  const at = from >= 0 && from < index ? index - 1 : index;
  if (at > without.length) return without; // dropped into the queue part
  return [...without.slice(0, at), id, ...without.slice(at)];
}

export function useUpNext() {
  const [ids, setIds] = React.useState(getUpNext);
  React.useEffect(() => {
    listeners.add(setIds);
    return () => listeners.delete(setIds);
  }, []);
  return ids;
}

/** URL of a scene that keeps Stash's queue parameters of the current URL. */
export function sceneUrl(id, { autoplay = false } = {}) {
  const params = new URLSearchParams(location.search);
  params.delete("t");
  if (autoplay) params.set("autoplay", "true");
  else params.delete("autoplay");
  const q = params.toString();
  return "/scenes/" + id + (q ? "?" + q : "");
}

// Scenes played in this tab, newest last: "previous" while the queue is randomized.
const PLAYED_KEY = "vibings-better-scenes:played";
function getPlayed() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PLAYED_KEY));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
export function notePlayed(id) {
  const list = getPlayed();
  if (list[list.length - 1] === String(id)) return;
  try { sessionStorage.setItem(PLAYED_KEY, JSON.stringify([...list, String(id)].slice(-200))); } catch { /* storage unavailable */ }
}

/** Going back while randomized: forget the scenes played after id. */
export function rewindPlayed(id) {
  const list = getPlayed();
  const i = list.lastIndexOf(String(id));
  if (i < 0) return;
  try { sessionStorage.setItem(PLAYED_KEY, JSON.stringify(list.slice(0, i))); } catch { /* storage unavailable */ }
}

// The random pick for "next" is made once per scene, so the preview on the
// button and the scene that then plays are the same.
const randomPick = new Map(); // current id -> picked id

/** A random queue scene, not the current one and not one played recently. */
export function pickRandom(scenes, currentId, played = getPlayed(), random = Math.random) {
  const ids = scenes.map((s) => String(s.id)).filter((id) => id !== String(currentId));
  if (!ids.length) return null;
  const recent = new Set(played.slice(-Math.floor(ids.length / 2)));
  const fresh = ids.filter((id) => !recent.has(id));
  const pool = fresh.length ? fresh : ids;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * Where "next" goes: the first up-next scene, else the next scene of Stash's
 * queue (a random one when randomized), else (with repeat) the queue's first
 * scene. null at the end.
 */
export function nextTarget(queue, currentId, repeat, shuffle = false) {
  const upNext = getUpNext().filter((id) => id !== String(currentId));
  if (upNext.length) return { kind: "upnext", id: upNext[0] };
  const scenes = queue?.scenes || [];
  if (shuffle && scenes.length > 1) {
    const key = String(currentId);
    if (!randomPick.has(key) || !scenes.some((s) => String(s.id) === randomPick.get(key))) randomPick.set(key, pickRandom(scenes, key));
    return { kind: "random", id: randomPick.get(key) };
  }
  const i = scenes.findIndex((s) => String(s.id) === String(currentId));
  if (i >= 0 && i < scenes.length - 1) return { kind: "stash", id: String(scenes[i + 1].id) };
  if (i >= 0 && queue?.hasMore) return { kind: "stash-more" };
  if (repeat && scenes.length && String(scenes[0].id) !== String(currentId)) return { kind: "stash", id: String(scenes[0].id) };
  return null;
}

export function prevTarget(queue, currentId, shuffle = false) {
  if (shuffle) {
    const played = getPlayed().filter((id) => id !== String(currentId));
    return played.length ? { kind: "random", id: played[played.length - 1] } : null;
  }
  const scenes = queue?.scenes || [];
  const i = scenes.findIndex((s) => String(s.id) === String(currentId));
  return i > 0 ? { kind: "stash", id: String(scenes[i - 1].id) } : null;
}
