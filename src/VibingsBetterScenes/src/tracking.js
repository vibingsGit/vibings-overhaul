// Play time and plays of this player.
//
// With Vibings Play Tracking Fix the video is handed to it (only real play
// time counts). Without it this does what Stash's own player does: while the
// video plays, one second of play time per second, saved every 10 seconds
// and on pause, and a play once Stash's minimum play percent is reached.

import { LOG, graphql, mutate, updateSceneCache } from "./api.js";
import { playTracking } from "./integrations.js";

let stashConfig = null;
function config() {
  if (!stashConfig) {
    stashConfig = graphql("query VibingsBetterScenesUi { configuration { ui } }")
      .then((d) => d?.configuration?.ui || {})
      .catch(() => ({}));
  }
  return stashConfig;
}

/** Stash's interface settings (trackActivity, minimumPlayPercent, alwaysStartFromBeginning, …). */
export const stashUi = config;

/** Starts tracking; returns stop(). getSceneId() names the scene playing now. */
export function trackPlays(video, getSceneId) {
  const fix = playTracking();
  if (fix?.track) return fix.track(video, getSceneId);
  return fallbackTracking(video, getSceneId);
}

function fallbackTracking(video, getSceneId) {
  let timer = null;
  let sceneId = null;
  let total = 0; // seconds this viewing
  let unsaved = 0;
  let counted = false;
  let enabled = true;
  let minPercent = 0;
  config().then((ui) => {
    enabled = ui.trackActivity !== false;
    minPercent = Number(ui.minimumPlayPercent) || 0;
  });

  async function save() {
    if (!sceneId || !enabled || unsaved <= 0) return;
    const id = sceneId;
    const seconds = unsaved;
    unsaved = 0;
    const dur = video.duration;
    let resume = video.currentTime;
    if (dur > 0 && (resume / dur) * 100 >= 98) resume = 0;
    try {
      await mutate("SceneSaveActivityDocument", { id, resume_time: resume, playDuration: seconds });
      updateSceneCache(id, { resume_time: () => resume, play_duration: (v) => (Number(v) || 0) + seconds });
    } catch (e) {
      console.warn(LOG, "could not save play time:", e.message);
    }
    if (!counted && dur > 0 && (total / dur) * 100 >= minPercent) {
      counted = true;
      try {
        const data = await mutate("SceneAddPlayDocument", { id });
        const r = data?.sceneAddPlay;
        if (r) updateSceneCache(id, { play_count: () => r.count, play_history: () => r.history, last_played_at: () => r.history?.[0] ?? null });
      } catch (e) {
        console.warn(LOG, "could not count the play:", e.message);
      }
    }
  }

  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
    save();
  };
  const startTimer = () => {
    if (timer || !enabled) return;
    timer = setInterval(() => {
      total += 1;
      unsaved += 1;
      if (unsaved >= 10) save();
    }, 1000);
  };
  const onLoad = () => {
    stopTimer();
    sceneId = getSceneId();
    total = 0;
    counted = false;
  };

  sceneId = getSceneId();
  const events = { playing: startTimer, pause: stopTimer, waiting: stopTimer, ended: stopTimer, loadstart: onLoad };
  for (const [e, fn] of Object.entries(events)) video.addEventListener(e, fn);
  return () => {
    for (const [e, fn] of Object.entries(events)) video.removeEventListener(e, fn);
    stopTimer();
  };
}
