// Vibings Play Tracking Fix — UI entry.
//
// Stash's scene player counts play time with a one-second timer that runs
// whenever the player says it is playing, and counts a play on the first
// save. This plugin turns that off and counts from the video itself: only
// time the video really plays adds play time, and a play is counted once
// the set share of the video has played in one viewing.

import { LOG, VERSION, stashTracksActivity } from "./api.js";
import { getSettings, loadSettings, onSettings } from "./settings.js";
import { trackVideo } from "./tracker.js";
import { injectStyles } from "./styles.js";
import { withHistoryCard } from "./SceneCard.jsx";
import { ToolsPanel } from "./ToolsPanel.jsx";
import { registerToolsPanel } from "../../_shared/overhaul-tools.jsx";

const PluginApi = window.PluginApi;
const CHECK_MS = 500;

let stashTracks = true;
const minPercent = () => getSettings().minPercent;
const active = () => stashTracks && getSettings().enabled;

export function sceneIdFromPath(pathname = location.pathname) {
  const m = pathname.match(/^\/scenes\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

// Stash's own tracking is a video.js plugin shared by every player; its
// timer and saves are switched off on the class while this plugin tracks.
let nativeProto = null;
let nativeOriginal = null;

function setNativeTracking(player, on) {
  if (!nativeProto) {
    let native;
    try { native = player.trackActivity?.(); } catch { return; }
    if (!native) return;
    nativeProto = Object.getPrototypeOf(native);
    nativeOriginal = { start: nativeProto.start, sendActivity: nativeProto.sendActivity };
  }
  const replaced = nativeProto.start !== nativeOriginal.start;
  if (on && replaced) {
    Object.assign(nativeProto, nativeOriginal);
    console.info(LOG, "Stash's own play tracking is back on");
  } else if (!on && !replaced) {
    nativeProto.start = function () {};
    nativeProto.sendActivity = function () {};
    console.info(LOG, "Stash's own play tracking is replaced");
  }
  if (!on) {
    try { player.trackActivity().stop(); } catch { /* player gone */ } // a timer started before this plugin
  }
}

// The <video> elements being tracked, with their stop functions.
const tracked = new Map();

function stopAll() {
  for (const [video, stop] of tracked) {
    stop();
    tracked.delete(video);
  }
}

function scan() {
  for (const [video, stop] of tracked) {
    if (!video.isConnected) {
      stop();
      tracked.delete(video);
    }
  }
  const root = document.querySelector(".video-js");
  const player = root?.player;
  if (!player || player.isDisposed?.()) return;
  setNativeTracking(player, !active());
  if (!active()) return;
  const video = root.querySelector("video");
  if (!video || tracked.has(video)) return;
  tracked.set(video, trackVideo(video, () => sceneIdFromPath(), minPercent));
}

export default function main() {
  injectStyles();

  // For other players, such as a later Vibings player: track a <video> element.
  window.VibingsPlayTracking = {
    version: VERSION,
    track(video, getSceneId) {
      if (tracked.has(video)) return tracked.get(video);
      const stop = trackVideo(video, getSceneId, minPercent);
      tracked.set(video, stop);
      return () => { stop(); tracked.delete(video); };
    },
  };

  onSettings(() => {
    if (!active()) stopAll();
    scan();
  });

  Promise.all([
    loadSettings(),
    stashTracksActivity().then((v) => { stashTracks = v; }).catch(() => {}),
  ]).finally(() => {
    if (!stashTracks) console.info(LOG, "activity tracking is off in Stash's settings; nothing is tracked");
    scan();
    setInterval(scan, CHECK_MS);
  });

  PluginApi.patch.before("ScenePage.TabContent", (props) => [{
    ...props,
    children: withHistoryCard(props.children, props.scene),
  }]);

  registerToolsPanel({
    id: "vibings-play-tracking-fix",
    title: "Vibings Play Tracking Fix",
    version: VERSION,
    description: "Play time from the video itself, estimated earlier plays and database tools.",
    order: 40,
    Component: ToolsPanel,
  });

  console.info(LOG, `v${VERSION} loaded`);
}
