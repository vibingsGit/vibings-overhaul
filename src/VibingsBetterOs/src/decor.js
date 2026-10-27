// Scene player decorations: O markers on the timeline, an O button in the
// control bar, and the pop-up when an O is added. Plain DOM inside video.js;
// re-checked on every change and twice a second, because Stash rebuilds the
// player when the scene or the stream changes.

import { fmtPos, fmtDateTime } from "./api.js";
import { getSettings, onSettings } from "./settings.js";
import { getScene, onScene, loadScene, setDuration } from "./store.js";
import { sceneIdFromPath, getPlayer } from "./player.js";
import { addSceneO } from "./tracker.js";

const LAYER = "vbo-marker-layer";
const BUTTON = "vbo-o-button";
const DROP_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="currentColor" d="M12 2.5c-.4 0-.8.2-1 .6C9.6 5.6 5 12 5 15.5a7 7 0 0 0 14 0C19 12 14.4 5.6 13 3.1c-.2-.4-.6-.6-1-.6Zm-3.2 13a.9.9 0 0 1 .9.9 2.4 2.4 0 0 0 2.4 2.4.9.9 0 1 1 0 1.8 4.2 4.2 0 0 1-4.2-4.2.9.9 0 0 1 .9-.9Z"/></svg>';

let lastFlash = 0;
let lastKey = "";

function renderMarkers(vjs, state, duration, settings) {
  const holder = vjs.querySelector(".vjs-progress-holder");
  if (!holder) return;
  let layer = holder.querySelector(`:scope > .${LAYER}`);
  if (!settings.player.markers) {
    layer?.remove();
    return;
  }
  if (!layer) {
    layer = document.createElement("div");
    layer.className = LAYER;
    holder.appendChild(layer);
  }
  const timed = duration ? state.events.filter((e) => e.t != null && e.t <= duration + 1) : [];
  const key = timed.map((e) => e.at + ":" + e.t).join("|") + "@" + duration;
  if (layer.dataset.key === key) return;
  layer.dataset.key = key;
  layer.replaceChildren(...timed.map((e) => {
    const m = document.createElement("div");
    m.className = "vbo-marker";
    m.dataset.at = e.at;
    m.style.left = `${Math.min(100, (e.t / duration) * 100)}%`;
    m.title = `O at ${fmtPos(e.t)} · ${fmtDateTime(e.at)}`;
    return m;
  }));
}

function renderButton(vjs, sceneId, state, settings) {
  const bar = vjs.querySelector(".vjs-control-bar");
  if (!bar) return;
  let btn = bar.querySelector(`.${BUTTON}`);
  if (!settings.player.button) {
    btn?.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = `vjs-control vjs-button ${BUTTON}`;
    btn.innerHTML = `${DROP_SVG}<span class="vbo-o-count"></span><span class="vjs-control-text">Add O at this time</span>`;
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      addSceneO(btn.dataset.scene, "player").catch((e) => console.warn("[Vibings Better Os]", e)).finally(() => {
        setTimeout(() => { btn.disabled = false; }, 600);
      });
    });
    const before = bar.querySelector(".vjs-fullscreen-control") || null;
    bar.insertBefore(btn, before);
  }
  btn.dataset.scene = sceneId;
  btn.title = "Add O at this time";
  btn.querySelector(".vbo-o-count").textContent = state.loaded ? String(state.history.length) : "";
}

function pop(vjs, state, duration, settings) {
  const flash = state.flash;
  if (!flash || flash.n <= lastFlash) return;
  lastFlash = flash.n;
  if (Date.now() - flash.n > 4000 || !settings.player.popup) return;
  const ev = state.events.find((e) => e.at === flash.at);
  const pct = ev && ev.t != null && duration ? Math.min(100, (ev.t / duration) * 100) : null;

  const marker = ev && vjs.querySelector(`.vbo-marker[data-at="${flash.at}"]`);
  if (marker) {
    marker.classList.remove("vbo-marker-new");
    void marker.offsetWidth; // restart the animation
    marker.classList.add("vbo-marker-new");
  }
  const bubble = document.createElement("div");
  bubble.className = "vbo-pop";
  bubble.innerHTML = '<span class="vbo-pop-ring"></span>' + DROP_SVG +
    `<span class="vbo-pop-text">O #${state.history.length}${ev && ev.t != null ? " · " + fmtPos(ev.t) : ""}</span>`;
  // Above the timeline at the O's position; centred when it has no position.
  const progress = vjs.querySelector(".vjs-progress-holder");
  if (pct != null && progress) {
    const vr = vjs.getBoundingClientRect();
    const pr = progress.getBoundingClientRect();
    const x = pr.left - vr.left + (pr.width * pct) / 100;
    bubble.style.left = `${Math.max(48, Math.min(vr.width - 48, x))}px`;
    bubble.style.bottom = `${vr.bottom - pr.top + 14}px`;
  } else {
    bubble.classList.add("vbo-pop-center");
  }
  vjs.appendChild(bubble);
  setTimeout(() => bubble.remove(), 2200);
}

function sync() {
  const sceneId = sceneIdFromPath();
  const vjs = document.querySelector(".video-js");
  if (!sceneId || !vjs) {
    lastKey = "";
    return;
  }
  const state = getScene(sceneId);
  if (!state.loaded && !state.loading) {
    loadScene(sceneId);
    return;
  }
  // A new scene: never replay the previous scene's pop-up.
  if (lastKey !== sceneId) {
    lastKey = sceneId;
    lastFlash = Math.max(lastFlash, state.flash?.n || 0);
  }
  const player = getPlayer();
  const pd = Number(player?.duration?.());
  const duration = Number.isFinite(pd) && pd > 0 ? pd : state.duration;
  if (Number.isFinite(pd) && pd > 0) setDuration(sceneId, pd);
  const settings = getSettings();
  renderButton(vjs, sceneId, state, settings);
  renderMarkers(vjs, state, duration, settings);
  pop(vjs, state, duration, settings);
}

let started = false;
export function startPlayerDecor() {
  if (started) return;
  started = true;
  onScene(() => sync());
  onSettings(() => sync());
  setInterval(sync, 500);
}

