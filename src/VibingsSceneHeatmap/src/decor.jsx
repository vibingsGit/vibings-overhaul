// The curve on Stash's own (video.js) player: rendered into the progress
// bar (so it has the bar's width), re-checked every half second because video.js rebuilds it.

import { Curve } from "./Curve.jsx";
import { getSettings } from "./settings.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const ReactDOM = PluginApi.ReactDOM;

let mounted = null; // { el, sceneId }

function sceneIdFromPath(pathname = location.pathname) {
  const m = pathname.match(/^\/scenes\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

function unmount() {
  if (!mounted) return;
  ReactDOM.unmountComponentAtNode(mounted.el);
  mounted.el.remove();
  mounted = null;
}

function sync() {
  const holder = document.querySelector(".video-js .vjs-progress-holder");
  const sceneId = sceneIdFromPath();
  if (!holder || !sceneId || !getSettings().native) return unmount();
  if (mounted && mounted.sceneId === sceneId && holder.contains(mounted.el)) return;
  unmount();
  const el = document.createElement("div");
  el.className = "vsh-native";
  holder.appendChild(el);
  ReactDOM.render(<Curve sceneId={sceneId} />, el);
  mounted = { el, sceneId };
}

export function startNativeDecor() {
  setInterval(sync, 500);
}
