// Vibings Scene Heatmap — UI entry.
//
// Records which parts of each video are actually watched (on Stash's own
// player and on Vibings Better Scenes) and draws a curve of the most
// watched parts over the timeline, like the "most replayed" curve of video
// sites. window.VibingsSceneHeatmap lets other players draw it too.

import { LOG, VERSION } from "./api.js";
import { loadSettings, getSettings } from "./settings.js";
import { injectStyles } from "./styles.js";
import { trackVideo } from "./tracker.js";
import { startNativeDecor } from "./decor.jsx";
import { Curve } from "./Curve.jsx";
import { useHeat, getHeat, loadHeat } from "./store.js";
import { ToolsPanel } from "./ToolsPanel.jsx";
import { registerToolsPanel } from "../../_shared/overhaul-tools.jsx";

const tracked = new Map(); // video -> stop

function sceneIdFromPath(pathname = location.pathname) {
  const m = pathname.match(/^\/scenes\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

// Stash's player and Vibings Better Scenes' player (marked with data-vibings-scene-id).
function scan() {
  for (const [video, stop] of tracked) {
    if (!video.isConnected) {
      stop();
      tracked.delete(video);
    }
  }
  for (const video of document.querySelectorAll(".video-js video, video[data-vibings-scene-id]")) {
    if (tracked.has(video)) continue;
    const getSceneId = () => video.dataset.vibingsSceneId || sceneIdFromPath();
    tracked.set(video, trackVideo(video, getSceneId));
  }
}

export default function main() {
  injectStyles();
  loadSettings();
  setInterval(scan, 1000);
  startNativeDecor();

  window.VibingsSceneHeatmap = { version: VERSION, Curve, useHeat, getHeat, loadHeat, getSettings };

  registerToolsPanel({
    id: "vibings-scene-heatmap",
    title: "Vibings Scene Heatmap",
    version: VERSION,
    description: "A curve of the most watched parts over the player's timeline.",
    order: 45,
    Component: ToolsPanel,
  });

  console.info(LOG, `v${VERSION} loaded`);
}
