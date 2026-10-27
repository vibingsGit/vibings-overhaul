// State shared by the parts of the scene page. Stash renders the player and
// the side panel as two separate components (ScenePlayer and ScenePage);
// both read and write here.

const PluginApi = window.PluginApi;
const React = PluginApi.React;

let state = {
  video: null, // the <video> element
  sceneId: null,
  queue: null, // Stash's queue props from ScenePage (scenes, onNext, …)
  loop: { whole: false, ab: { enabled: false, start: 0, end: 0 } },
  panel: null, // open overlay: "queue" | "help"
  filters: { video: {}, audio: {} }, // video and audio filter values (see filters.js, audio.js)
  below: null, // a view under the player to open ("filters", …), set by the player's menu
  theater: null, // null = the setting
  sleep: null, // sleep timer: { until: ms } or { endOfScene: true }
  marker: null, // quick marker being added: { t }
  shot: null, // screenshot taken: { url, t }
  handoff: null, // from the mini player back to the page: { sceneId, t, play }
};
const listeners = new Set();

export const getState = () => state;

export function setState(partial) {
  const next = typeof partial === "function" ? partial(state) : partial;
  let changed = false;
  for (const k of Object.keys(next)) if (state[k] !== next[k]) changed = true;
  if (!changed) return;
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-renders when the selected part of the state changes. */
export function useStore(select = (s) => s) {
  const [value, setValue] = React.useState(() => select(state));
  const selectRef = React.useRef(select);
  selectRef.current = select;
  React.useEffect(() => subscribe((s) => setValue(() => selectRef.current(s))), []);
  return value;
}

export function seek(t) {
  const v = state.video;
  if (!v || !Number.isFinite(t)) return;
  v.currentTime = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : t, t));
}

export function togglePlay() {
  const v = state.video;
  if (!v) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

// ---------------------------------------------------------------- Toasts

// One toast at a time: a new one replaces the one showing.
let toastEl = null;
let toastTimer = null;
export function toast(text, error = false) {
  toastEl?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.className = "vbs-toast" + (error ? " vbs-toast-error" : "");
  el.textContent = text;
  (document.fullscreenElement || document.body).appendChild(el);
  toastEl = el;
  toastTimer = setTimeout(() => el.remove(), 2200);
}

export async function copy(text) {
  const str = String(text ?? "");
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(str);
    else {
      const ta = document.createElement("textarea");
      ta.value = str;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("Copied");
  } catch {
    toast("Copy failed", true);
  }
}
