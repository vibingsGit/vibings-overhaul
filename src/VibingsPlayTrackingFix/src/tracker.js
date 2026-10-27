// Follows one <video> element and saves its play time and plays to Stash.
//
// Works on the element itself, so it serves Stash's video.js player and any
// other player that plays a scene in a <video> element (see
// window.VibingsPlayTracking in index.js).

import { LOG, saveActivity, addPlay } from "./api.js";
import { record, flush } from "./ledger.js";
import { WatchClock, PlaySession, startsOver, resumeTime, DEFAULT_MIN_PERCENT } from "./session.js";

const EVENTS = ["timeupdate", "pause", "seeking", "seeked", "ratechange", "ended", "loadstart", "emptied"];

/**
 * Starts tracking a video. getSceneId() names the scene it plays (null when
 * none); getMinPercent() the play threshold. Returns stop().
 */
export function trackVideo(video, getSceneId, getMinPercent = () => DEFAULT_MIN_PERCENT) {
  const clock = new WatchClock();
  let session = null;
  let lastResume = null;
  let saving = Promise.resolve();

  const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);

  // Where the session's video is; kept on the session so a save after the
  // video has moved on to another scene still uses the right position.
  function note(s) {
    if (!s || !Number.isFinite(video.currentTime)) return;
    s.position = video.currentTime;
    s.duration = duration() || s.duration || 0;
  }

  // Saves the unsaved time and the resume point. Saves run one after another.
  function save({ keepalive = false, force = false } = {}) {
    const s = session;
    if (!s || !s.watched) return saving;
    const seconds = s.take();
    const resume = resumeTime(s.position ?? 0, s.duration || 0);
    // Nothing new: skip. Small amounts wait for the next save unless the session ends.
    const sameResume = lastResume != null && Math.abs(resume - lastResume) < 1;
    if (sameResume && (seconds === 0 || (!force && seconds < 0.5))) {
      s.giveBack(seconds);
      return saving;
    }
    lastResume = resume;
    if (keepalive) {
      // The page is going away: send both now instead of after the save.
      saveActivity(s.sceneId, seconds, resume, { keepalive }).catch(() => {});
      if (seconds > 0) record(s.sceneId, seconds, 0);
      flush({ keepalive });
      return saving;
    }
    saving = saving
      .then(() => saveActivity(s.sceneId, seconds, resume))
      .then(() => { if (seconds > 0) record(s.sceneId, seconds, 0); })
      .catch((e) => {
        s.giveBack(seconds);
        console.warn(LOG, `could not save play time of scene ${s.sceneId}:`, e?.message || e);
      });
    return saving;
  }

  function countPlay(s) {
    saving = saving
      .then(() => addPlay(s.sceneId))
      .then(() => record(s.sceneId, 0, 1))
      .then(() => console.info(LOG, `play counted for scene ${s.sceneId} after ${s.watched.toFixed(1)} s`))
      .catch((e) => {
        s.counted = false;
        console.warn(LOG, `could not count play of scene ${s.sceneId}:`, e?.message || e);
      });
  }

  function endSession(reason) {
    if (!session) return;
    if (session.watched > 0) {
      console.info(LOG, `scene ${session.sceneId}: ${session.watched.toFixed(1)} s watched (${reason})${session.counted ? ", play counted" : ""}`);
    }
    save({ force: true }).then(() => flush());
    session = null;
    lastResume = null;
  }

  // The session for the scene playing now; a new scene ends the old session.
  function currentSession() {
    const id = getSceneId();
    if (!id) return null;
    if (session && session.sceneId !== String(id)) endSession("scene changed");
    if (!session) session = new PlaySession(id, getMinPercent());
    return session;
  }

  function sample() {
    const s = currentSession();
    const seconds = clock.sample({
      t: video.currentTime,
      wall: performance.now(),
      paused: video.paused,
      seeking: video.seeking,
      rate: video.playbackRate,
    });
    note(s);
    if (!s || !seconds) return;
    const out = s.add(seconds, duration());
    if (out.countPlay) countPlay(s);
    if (out.save) save();
  }

  function onEvent(ev) {
    switch (ev.type) {
      case "timeupdate":
      case "ratechange":
        sample();
        break;
      case "pause":
        sample();
        save().then(() => flush());
        break;
      case "seeking": {
        // The time already jumped; a jump from the end to the start is the video starting over.
        const from = clock.last?.t;
        if (startsOver(from, video.currentTime, duration(), session?.counted)) {
          note(session); // resume from where the video now is: the start
          endSession("started over");
        }
        else {
          note(session);
          save();
        }
        clock.reset(video.currentTime, performance.now());
        break;
      }
      case "seeked":
        clock.reset(video.currentTime, performance.now());
        break;
      case "ended":
        // The viewing is over; playing again (replay) starts a new one.
        sample();
        endSession("ended");
        break;
      case "loadstart":
      case "emptied":
        endSession("new video");
        clock.reset();
        break;
    }
  }

  // Loops may not fire "seeking"; catch them from the timeline instead.
  function onTimeupdateLoop() {
    const from = clock.last?.t;
    if (from != null && startsOver(from, video.currentTime, duration(), session?.counted)) {
      note(session);
      endSession("started over");
      clock.reset(video.currentTime, performance.now());
    }
  }

  const onPageHide = () => save({ keepalive: true });
  const onVisibility = () => { if (document.visibilityState === "hidden") save({ keepalive: true }); };

  video.addEventListener("timeupdate", onTimeupdateLoop);
  for (const e of EVENTS) video.addEventListener(e, onEvent);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  clock.reset(video.currentTime, performance.now());

  return function stop() {
    video.removeEventListener("timeupdate", onTimeupdateLoop);
    for (const e of EVENTS) video.removeEventListener(e, onEvent);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
    endSession("stopped");
  };
}
