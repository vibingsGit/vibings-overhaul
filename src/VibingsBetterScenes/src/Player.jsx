// The video player. Stash renders it in place of its own ScenePlayer and
// passes the same props (scene, autoplay, initialTimestamp, sendSetTimestamp,
// onComplete, onNext, onPrevious), so markers, "play from here" links,
// autoplay and continue playlist keep working.

import { LOG, addSceneO } from "./api.js";
import { fmtTime, sceneTitle } from "./format.js";
import { Icons } from "./icons.jsx";
import { Timeline, useSprites } from "./Timeline.jsx";
import { useContextMenu } from "./ContextMenu.jsx";
import { useSettings, saveSettings, getDevice, setDevice } from "./settings.js";
import { getState, setState, useStore, toast, copy } from "./store.js";
import { trackPlays, stashUi } from "./tracking.js";
import { betterOs } from "./integrations.js";
import { nextTarget, prevTarget, sceneUrl, removeFromQueue, useUpNext, notePlayed, rewindPlayed } from "./queue.js";
import { NavPreview } from "./NavPreview.jsx";
import { BelowPlayer } from "./BelowPlayer.jsx";
import { NerdStats } from "./Nerds.jsx";
import { videoCss, svgFilterMarkup } from "./filters.js";
import { applyAudio, setLevelling } from "./audio.js";
import { chapters as toChapters, chapterAt, sleepLeft } from "./logic.js";
import { getLibrary } from "./settings.js";
import { takeScreenshot, ScreenshotDialog, QuickMarker, useAmbient, hottest, sceneHeatmap, fadeOutAndPause } from "./PlayerTools.jsx";
import { openMini, closeMini } from "./MiniPlayer.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { useHistory } = PluginApi.libraries.ReactRouterDOM;

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];

const isTyping = (el) => !!el?.closest?.("input, textarea, select, [contenteditable=true], .modal");

function bufferedRanges(v) {
  const out = [];
  for (let i = 0; i < (v?.buffered?.length || 0); i++) out.push([v.buffered.start(i), v.buffered.end(i)]);
  return out;
}

// O positions on the timeline, from Vibings Better Os when it is installed.
function useOEvents(sceneId) {
  const [state, setLocal] = React.useState(null);
  React.useEffect(() => {
    const api = betterOs();
    if (!api || !sceneId) return undefined;
    const key = String(sceneId);
    setLocal(api.getScene(key));
    if (!api.getScene(key).loaded) api.loadScene(key);
    return api.onScene((changed) => { if (changed === key || changed === "*") setLocal(api.getScene(key)); });
  }, [sceneId]);
  if (!state) return [];
  const fresh = state.flash && Date.now() - state.flash.n < 4000 ? state.flash.at : null;
  const live = new Set(state.history);
  return state.events.filter((e) => e.t != null && live.has(e.at)).map((e) => ({ ...e, fresh: e.at === fresh }));
}

export const SHORTCUTS = [
  ["Space / K", "Play or pause"],
  ["← / →", "Back / forward (seek step)"],
  ["J / L", "Back / forward 10 s"],
  ["Shift + ← / →", "Back / forward 5 s"],
  ["Ctrl + ← / →", "Back / forward 1 min"],
  [", / .", "One frame back / forward (paused)"],
  ["0–9", "Jump to 0–90 %"],
  ["↑ / ↓", "Volume"],
  ["M", "Mute"],
  ["F", "Fullscreen"],
  ["T", "Theater mode"],
  ["O", "Add an O at the current time"],
  ["Shift + N / P", "Next / previous scene"],
  ["[ / ]", "Set loop start / end"],
  ["\\", "Loop on or off"],
  ["B", "Add a marker at the current time"],
  ["H", "Jump to the most watched part (Vibings Scene Heatmap)"],
  ["Shift + S", "Screenshot of the current frame"],
];

const SLEEP_MINUTES = [15, 30, 45, 60, 90];
const coarse = () => window.matchMedia?.("(pointer: coarse)").matches;

export function Player(props) {
  const { scene, autoplay, initialTimestamp, sendSetTimestamp, onComplete, onNext, onPrevious } = props;
  const settings = useSettings();
  const history = useHistory();
  const videoRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(scene.files?.[0]?.duration || 0);
  const [buffered, setBuffered] = React.useState([]);
  const [volume, setVolume] = React.useState(getDevice().volume);
  const [muted, setMuted] = React.useState(getDevice().muted);
  const [rate, setRate] = React.useState(1);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const [scrubbing, setScrubbing] = React.useState(false);
  const [menu, setMenu] = React.useState(null); // "settings" | "rate" | "source" | "loop" | "volume"
  const [streamIndex, setStreamIndex] = React.useState(0);
  const [ripple, setRipple] = React.useState(null); // { side, n }
  const [pop, setPop] = React.useState(null); // { t, n }
  const [nerds, setNerds] = React.useState(false);
  const loop = useStore((s) => s.loop);
  const filters = useStore((s) => s.filters);
  const sleep = useStore((s) => s.sleep);
  const marker = useStore((s) => s.marker);
  const shot = useStore((s) => s.shot);
  const [swipe, setSwipe] = React.useState(null); // { kind: "x" | "y", dx, label, level }
  const queue = useStore((s) => s.queue);
  const theater = useStore((s) => s.theater ?? settings.layout.theater);
  const upNext = useUpNext();
  const ctx = useContextMenu();
  const sprites = useSprites(scene, settings.timeline.thumbnails);
  const oEvents = useOEvents(scene.id);
  const hideTimer = React.useRef(null);
  const pending = React.useRef(null); // { t, play } applied when the new source has loaded
  const sceneIdRef = React.useRef(String(scene.id));
  sceneIdRef.current = String(scene.id);
  // What the mini player needs when the page is left.
  const latest = React.useRef({});
  latest.current = { settings, scene, history, url: location.pathname + location.search };
  const stopTracking = React.useRef(null);
  const [fromMiniAtMount] = React.useState(() => closeMini()); // a mini player of this scene hands its time over
  const handoff = React.useRef(fromMiniAtMount);

  const streams = scene.sceneStreams || [];
  const stream = streams[streamIndex] || null;

  // ------------------------------------------------------------ Shared state, tracking, timestamps
  React.useEffect(() => {
    const v = videoRef.current;
    setState({ video: v });
    stopTracking.current = trackPlays(v, () => sceneIdRef.current);
    return () => {
      stopTracking.current?.(); // null when the mini player took the video
      setState({ video: null });
    };
  }, []);

  // Leaving the page while playing: the video moves into the mini player
  // before React removes it (a layout effect runs before the removal).
  React.useLayoutEffect(() => () => {
    const v = videoRef.current;
    const { settings: s, scene: sc, history: h, url } = latest.current;
    const toScene = /^\/scenes\/\d+/.test(location.pathname);
    if (!v || !s.player.miniPlayer || v.paused || v.ended || toScene || document.fullscreenElement) return;
    const stop = stopTracking.current;
    stopTracking.current = null;
    v.loop = false;
    openMini({ video: v, scene: sc, stop, history: h, url });
  }, []);

  React.useEffect(() => {
    setState({ sceneId: String(scene.id) });
  }, [scene.id]);

  React.useEffect(() => {
    sendSetTimestamp?.((t) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = t;
      if (v.paused) v.play().catch(() => {});
    });
  }, [sendSetTimestamp]);

  // ------------------------------------------------------------ Loading a scene
  React.useEffect(() => {
    const v = videoRef.current;
    setStreamIndex(0);
    setStarted(false);
    setCurrent(0);
    setDuration(scene.files?.[0]?.duration || 0);
    setState({ loop: { whole: false, ab: { enabled: false, start: 0, end: 0 } }, marker: null, shot: null });
    const remembered = getLibrary().sceneFilters[String(scene.id)];
    if (remembered) setState({ filters: { video: { ...(remembered.video || {}) }, audio: { ...(remembered.audio || {}) } } });
    else if (!getDevice().keepFilters) setState({ filters: { video: {}, audio: {} } });
    // Back from the mini player: carry on from its time.
    const fromMini = [handoff.current, getState().handoff].find((h) => h && h.sceneId === String(scene.id));
    handoff.current = null;
    if (getState().handoff) setState({ handoff: null });
    let cancelled = false;
    stashUi().then(async (ui) => {
      if (cancelled) return;
      const d = scene.files?.[0]?.duration || 0;
      let t = initialTimestamp > 0 ? initialTimestamp : ui.alwaysStartFromBeginning ? 0 : scene.resume_time || 0;
      if (d > 0 && t / d >= 0.98) t = 0;
      let play = !!autoplay || settings.player.autoplay || !!ui.autostartVideo ||
        document.fullscreenElement === wrapRef.current; // keep playing through a queue in fullscreen
      if (fromMini) {
        t = fromMini.t;
        play = fromMini.play;
      } else if (t === 0 && !(initialTimestamp > 0) && settings.player.startHottest) {
        const hot = await hottest(scene.id, d).catch(() => null);
        if (cancelled) return;
        if (hot > 0) { t = hot; toast("Starting from the most watched part"); }
      }
      pending.current = { t, play };
      if (v.readyState >= 1) applyPending();
    });
    return () => { cancelled = true; };
  }, [scene.id]);

  function applyPending() {
    const v = videoRef.current;
    const p = pending.current;
    if (!v || !p) return;
    pending.current = null;
    if (p.t > 0) v.currentTime = p.t;
    if (p.play) v.play().catch((e) => console.info(LOG, "autoplay blocked:", e.message));
  }

  // The stream to play; a stream that fails moves on to the next one (for example a transcoded one).
  React.useEffect(() => {
    const v = videoRef.current;
    if (!stream || !v) return;
    if (v.getAttribute("src") === stream.url) return;
    v.src = stream.url;
    v.load();
  }, [stream?.url]);

  const onError = () => {
    const v = videoRef.current;
    if (!v?.error || streamIndex >= streams.length - 1) {
      if (v?.error) toast("This video cannot be played", true);
      return;
    }
    const next = streams[streamIndex + 1];
    pending.current = { t: v.currentTime || pending.current?.t || 0, play: !v.paused || pending.current?.play };
    console.info(LOG, "stream failed, trying", next.label || next.url);
    toast("Switched to " + (next.label || "another stream"));
    setStreamIndex(streamIndex + 1);
  };

  // ------------------------------------------------------------ Video events
  React.useEffect(() => {
    const v = videoRef.current;
    v.volume = volume;
    v.muted = muted;
    const handlers = {
      play: () => { setPlaying(true); setStarted(true); },
      pause: () => setPlaying(false),
      playing: () => setWaiting(false),
      waiting: () => setWaiting(true),
      canplay: () => setWaiting(false),
      timeupdate: () => setCurrent(v.currentTime),
      seeking: () => setCurrent(v.currentTime),
      durationchange: () => Number.isFinite(v.duration) && setDuration(v.duration),
      loadedmetadata: () => { if (Number.isFinite(v.duration)) setDuration(v.duration); applyPending(); },
      progress: () => setBuffered(bufferedRanges(v)),
      volumechange: () => {
        setVolume(v.volume);
        setMuted(v.muted);
        if (!v.dataset.vbsFading) setDevice({ volume: v.volume, muted: v.muted });
      },
      ratechange: () => setRate(v.playbackRate),
    };
    for (const [e, fn] of Object.entries(handlers)) v.addEventListener(e, fn);
    return () => { for (const [e, fn] of Object.entries(handlers)) v.removeEventListener(e, fn); };
  }, []);

  // Video filters (CSS on the video element) and audio filters (Web Audio, made when first needed).
  React.useEffect(() => {
    const v = videoRef.current;
    const fit = v.clientWidth ? v.clientHeight / v.clientWidth : 1;
    const css = videoCss(filters.video, Math.min(fit, 1 / fit));
    v.style.filter = css.filter === "none" ? "" : css.filter;
    v.style.transform = css.transform === "none" ? "" : css.transform;
    applyAudio(v, filters.audio);
  }, [filters]);

  React.useEffect(() => { setLevelling(videoRef.current, settings.player.normalize); }, [settings.player.normalize]);

  // Loops: the whole video, or between A and B.
  React.useEffect(() => {
    const v = videoRef.current;
    v.loop = !!loop.whole && !sleep?.endOfScene; // "stop after this scene" ends a loop too
    if (!loop.ab.enabled || !(loop.ab.end > loop.ab.start)) return undefined;
    const onTime = () => { if (v.currentTime >= loop.ab.end || v.currentTime < loop.ab.start - 1) v.currentTime = loop.ab.start; };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [loop, sleep?.endOfScene]);

  // Sleep timer: fade out and pause when the time is up.
  React.useEffect(() => {
    if (!sleep?.until) return undefined;
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (sleepLeft(getState().sleep) > 0 || !v || v.dataset.vbsFading) return;
      setState({ sleep: null });
      if (!v.paused) fadeOutAndPause(v, () => toast("Sleep timer: paused"));
    }, 1000);
    return () => clearInterval(timer);
  }, [sleep?.until]);

  // ------------------------------------------------------------ Queue
  const go = React.useCallback((target, play) => {
    if (!target) return false;
    if (target.kind === "upnext") {
      removeFromQueue(target.id);
      history.push(sceneUrl(target.id, { autoplay: play }));
    } else if (target.kind === "stash-more") {
      (play ? onComplete : onNext)?.();
    } else {
      history.push(sceneUrl(target.id, { autoplay: play }));
    }
    return true;
  }, [history, onComplete, onNext]);

  // The scene right after this one in Stash's queue (Stash's own next handles paging).
  const isFollowing = (q, id) => {
    const scenes = q?.scenes || [];
    const i = scenes.findIndex((s) => String(s.id) === sceneIdRef.current);
    return i >= 0 && String(scenes[i + 1]?.id) === String(id);
  };
  const next = () => {
    const q = getState().queue;
    const target = nextTarget(q, scene.id, settings.queue.repeat, settings.queue.shuffle);
    if (target?.kind === "stash" && onNext && isFollowing(q, target.id)) return onNext();
    go(target, true);
  };
  const prev = (sceneOnly = false) => {
    const v = videoRef.current;
    if (sceneOnly !== true && v && v.currentTime > 5) { v.currentTime = 0; return; }
    const target = prevTarget(getState().queue, scene.id, settings.queue.shuffle);
    if (!target) return;
    if (target.kind === "random") {
      rewindPlayed(target.id);
      go(target, true);
    } else onPrevious?.();
  };
  const nextT = nextTarget(queue, scene.id, settings.queue.repeat, settings.queue.shuffle);
  const prevT = prevTarget(queue, scene.id, settings.queue.shuffle);
  const hasNext = !!nextT;
  const hasPrev = !!prevT;

  React.useEffect(() => { notePlayed(scene.id); }, [scene.id]);

  React.useEffect(() => {
    const v = videoRef.current;
    const onEnded = () => {
      if (v.loop) return;
      if (getState().sleep?.endOfScene) {
        setState({ sleep: null });
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        return toast("Sleep timer: stopped after the scene");
      }
      const q = getState().queue;
      if (!q?.continuePlaylist) return;
      const target = nextTarget(q, sceneIdRef.current, settings.queue.repeat, settings.queue.shuffle);
      if (target?.kind === "stash" && isFollowing(q, target.id) && onComplete) return onComplete();
      go(target, true);
    };
    v.addEventListener("ended", onEnded);
    return () => v.removeEventListener("ended", onEnded);
  }, [go, onComplete, settings.queue.repeat, settings.queue.shuffle]);

  // ------------------------------------------------------------ Controls
  const togglePlay = () => {
    const v = videoRef.current;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seekTo = (t) => {
    const v = videoRef.current;
    const d = Number.isFinite(v.duration) ? v.duration : duration;
    v.currentTime = Math.max(0, Math.min(d || 0, t));
    setCurrent(v.currentTime);
  };
  const seekBy = (dt) => seekTo(videoRef.current.currentTime + dt);
  const setVol = (val) => {
    const v = videoRef.current;
    v.volume = Math.max(0, Math.min(1, val));
    v.muted = v.volume === 0;
  };
  const toggleFullscreen = () => {
    const el = wrapRef.current;
    const v = videoRef.current;
    if (document.fullscreenElement) return document.exitFullscreen?.().catch(() => {});
    if (el.requestFullscreen) {
      return el.requestFullscreen().then(() => {
        // Phones: turn the screen to the video's orientation.
        if (settings.player.rotate && coarse() && screen.orientation?.lock && v.videoWidth) {
          screen.orientation.lock(v.videoWidth >= v.videoHeight ? "landscape" : "portrait").catch(() => {});
        }
      }).catch(() => v.webkitEnterFullscreen?.());
    }
    v.webkitEnterFullscreen?.(); // iPhone
  };
  const toggleTheater = () => setState({ theater: !theater });
  const togglePip = async () => {
    const v = videoRef.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch (e) {
      toast("Picture in picture is not available", true);
    }
  };
  const setLoop = (changes) => setState({ loop: { ...getState().loop, ...changes } });
  const setAb = (changes) => setLoop({ ab: { ...getState().loop.ab, ...changes } });
  const recordO = async () => {
    const t = videoRef.current.currentTime;
    try {
      await addSceneO(scene.id);
      setPop({ t, n: Date.now() });
      toast("O at " + fmtTime(t));
    } catch (e) {
      console.warn(LOG, e);
      toast("Could not add the O: " + e.message, true);
    }
  };

  // The most watched part, from Vibings Scene Heatmap.
  const heatOn = !!sceneHeatmap();
  const jumpHottest = async () => {
    const t = await hottest(scene.id, duration).catch(() => null);
    if (t == null) return toast("Not enough watched yet to know the most watched part");
    seekTo(t);
    videoRef.current.play().catch(() => {});
    toast("Most watched part · " + fmtTime(t));
  };
  const addMarker = () => {
    if (scene.id) setState({ marker: { t: videoRef.current.currentTime } });
  };
  const frameStep = (dir) => {
    const v = videoRef.current;
    if (!v.paused) v.pause();
    seekBy(dir / (scene.files?.[0]?.frame_rate || 30));
  };
  const chapterList = React.useMemo(() => toChapters(scene.scene_markers, duration), [scene.scene_markers, duration]);
  const chapterNow = settings.timeline.chapters ? chapterAt(chapterList, current) : null;
  const setSleep = (value) => {
    if (value === "end") setState({ sleep: { endOfScene: true } });
    else if (value) setState({ sleep: { until: Date.now() + Number(value) * 60000, minutes: Number(value) } });
    else setState({ sleep: null });
    if (value) toast(value === "end" ? "Stops after this scene" : "Pauses in " + value + " min");
  };
  const sleepText = sleep?.endOfScene ? "end of scene" : sleep?.until ? Math.ceil(sleepLeft(sleep) / 60) + " min" : null;

  React.useEffect(() => {
    const onFs = () => {
      setFullscreen(document.fullscreenElement === wrapRef.current);
      if (!document.fullscreenElement) try { screen.orientation?.unlock?.(); } catch { /* not supported */ }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Controls hide while playing, after the set time without movement.
  const poke = React.useCallback(() => {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), Math.max(1, settings.player.controlsHide) * 1000);
  }, [settings.player.controlsHide]);
  React.useEffect(() => () => clearTimeout(hideTimer.current), []);
  const showControls = visible || !playing || !!menu || scrubbing || !!marker;

  useAmbient(videoRef, wrapRef, settings.player.ambient && !fullscreen);

  // ------------------------------------------------------------ Keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || isTyping(e.target) || e.altKey || e.metaKey || document.querySelector(".modal.show, .vbs-modal-back")) return;
      const v = videoRef.current;
      const step = settings.player.seekStep || 10;
      const k = e.key;
      const handled = () => { e.preventDefault(); e.stopImmediatePropagation(); poke(); };
      if (k === " " || k === "k" || k === "K") { handled(); togglePlay(); }
      else if (k === "ArrowLeft") { handled(); seekBy(e.ctrlKey ? -60 : e.shiftKey ? -5 : -step); }
      else if (k === "ArrowRight") { handled(); seekBy(e.ctrlKey ? 60 : e.shiftKey ? 5 : step); }
      else if (k === "j" || k === "J") { handled(); seekBy(-10); }
      else if (k === "l" || k === "L") { handled(); seekBy(10); }
      else if (k === "ArrowUp") { handled(); setVol(v.volume + 0.05); }
      else if (k === "ArrowDown") { handled(); setVol(v.volume - 0.05); }
      else if (k === "m" || k === "M") { handled(); v.muted = !v.muted; }
      else if (k === "f" || k === "F") { handled(); toggleFullscreen(); }
      else if (k === "t" || k === "T") { handled(); toggleTheater(); }
      else if ((k === "o" || k === "O") && !e.ctrlKey) { handled(); recordO(); }
      else if (k === "N" && e.shiftKey) { handled(); next(); }
      else if (k === "P" && e.shiftKey) { handled(); prev(); }
      else if ((k === "," || k === ".") && v.paused) { handled(); frameStep(k === "," ? -1 : 1); }
      else if (/^[0-9]$/.test(k) && !e.ctrlKey && duration) { handled(); seekTo((+k / 10) * duration); }
      else if (k === "[") { handled(); setAb({ start: v.currentTime, enabled: getState().loop.ab.end > v.currentTime }); toast("Loop start " + fmtTime(v.currentTime)); }
      else if (k === "]") { handled(); setAb({ end: v.currentTime, enabled: v.currentTime > getState().loop.ab.start }); toast("Loop end " + fmtTime(v.currentTime)); }
      else if (k === "\\") { handled(); setAb({ enabled: !getState().loop.ab.enabled }); }
      else if ((k === "b" || k === "B") && !e.ctrlKey) { handled(); addMarker(); }
      else if ((k === "h" || k === "H") && !e.ctrlKey && heatOn) { handled(); jumpHottest(); }
      else if (k === "S" && e.shiftKey && !e.ctrlKey) { handled(); takeScreenshot(v); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // ------------------------------------------------------------ Media session (lock screen, headset keys)
  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return undefined;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: sceneTitle(scene),
      artist: (scene.performers || []).map((p) => p.name).join(", "),
      album: scene.studio?.name || "",
      artwork: scene.paths?.screenshot ? [{ src: scene.paths.screenshot }] : [],
    });
    const actions = {
      play: () => videoRef.current.play(),
      pause: () => videoRef.current.pause(),
      seekbackward: () => seekBy(-(settings.player.seekStep || 10)),
      seekforward: () => seekBy(settings.player.seekStep || 10),
      previoustrack: hasPrev ? prev : null,
      nexttrack: hasNext ? next : null,
    };
    for (const [a, fn] of Object.entries(actions)) {
      try { navigator.mediaSession.setActionHandler(a, fn); } catch { /* not supported */ }
    }
    return () => {
      for (const a of Object.keys(actions)) {
        try { navigator.mediaSession.setActionHandler(a, null); } catch { /* not supported */ }
      }
    };
  }, [scene.id, hasNext, hasPrev]);

  // ------------------------------------------------------------ Touch: tap shows controls, double tap seeks,
  // swipe sideways for the next/previous scene, up/down in fullscreen for the volume.
  const lastTap = React.useRef(0);
  const gesture = React.useRef(null); // { x, y, vol, axis }
  const onVideoPointerDown = (e) => {
    if (e.pointerType === "mouse" || !settings.player.gestures) return;
    gesture.current = { x: e.clientX, y: e.clientY, vol: videoRef.current.volume, axis: null, id: e.pointerId };
  };
  const onVideoPointerMove = (e) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : fullscreen ? "y" : "none";
      if (g.axis !== "none") try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
    }
    if (g.axis === "x") {
      const forward = dx < 0;
      const target = forward ? nextT : prevT;
      setSwipe({ kind: "x", dx, label: target ? (forward ? "Next scene" : "Previous scene") : forward ? "No next scene" : "No previous scene", ok: !!target });
    } else if (g.axis === "y") {
      const h = e.currentTarget.getBoundingClientRect().height || 1;
      const level = Math.max(0, Math.min(1, g.vol - dy / (h * 0.8)));
      setVol(level);
      setSwipe({ kind: "y", level });
    }
  };
  const endGesture = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.axis || g.axis === "none") return false;
    setSwipe(null);
    if (g.axis === "x" && e.type === "pointerup") {
      const dx = e.clientX - g.x;
      const w = e.currentTarget.getBoundingClientRect().width || 1;
      if (Math.abs(dx) > Math.min(160, w * 0.25)) {
        if (dx < 0 && hasNext) next();
        else if (dx > 0 && hasPrev) prev(true);
      }
    }
    return true;
  };
  const onVideoPointerUp = (e) => {
    if (e.pointerType === "mouse") return;
    if (endGesture(e)) { lastTap.current = 0; return; }
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (settings.player.doubleTap && now - lastTap.current < 300 && (x < 0.35 || x > 0.65)) {
      const side = x < 0.35 ? -1 : 1;
      seekBy(side * (settings.player.seekStep || 10));
      setRipple({ side, n: now });
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    if (!showControls) poke();
    else if (playing) { clearTimeout(hideTimer.current); setVisible(false); }
  };
  const onVideoClick = (e) => {
    if (e.nativeEvent.pointerType && e.nativeEvent.pointerType !== "mouse") return;
    togglePlay();
  };

  const playerMenu = () => [
    { label: playing ? "Pause" : "Play", icon: playing ? <Icons.Pause /> : <Icons.Play />, hint: "Space", onClick: togglePlay },
    { label: "Add an O here", icon: <Icons.Drop />, hint: "O", onClick: recordO },
    { separator: true },
    { label: loop.whole ? "Stop looping" : "Loop video", icon: <Icons.Loop />, onClick: () => setLoop({ whole: !loop.whole }) },
    { label: "Set loop start here", icon: <Icons.Back />, hint: "[", onClick: () => setAb({ start: videoRef.current.currentTime, enabled: loop.ab.end > videoRef.current.currentTime }) },
    { label: "Set loop end here", icon: <Icons.Forward />, hint: "]", onClick: () => setAb({ end: videoRef.current.currentTime, enabled: videoRef.current.currentTime > loop.ab.start }) },
    { separator: true },
    { label: "Add a marker here", icon: <Icons.Bookmark />, hint: "B", onClick: addMarker },
    { label: "Screenshot", icon: <Icons.Camera />, hint: "⇧S", onClick: () => takeScreenshot(videoRef.current) },
    heatOn && { label: "Most watched part", icon: <Icons.Flame />, hint: "H", onClick: jumpHottest },
    { separator: true },
    { label: "Copy link at this time", icon: <Icons.Link />, onClick: () => copy(location.origin + "/scenes/" + scene.id + "?t=" + Math.floor(videoRef.current.currentTime)) },
    { label: "Copy current time", icon: <Icons.Clock />, onClick: () => copy(fmtTime(videoRef.current.currentTime)) },
    { label: "Picture in picture", icon: <Icons.Pip />, onClick: togglePip },
    { label: "Stats for nerds", icon: <Icons.Info />, onClick: () => setNerds(true) },
    { label: "Keyboard shortcuts", icon: <Icons.Keyboard />, onClick: () => setState({ panel: "help" }) },
    { separator: true },
    { label: fullscreen ? "Exit fullscreen" : "Fullscreen", icon: fullscreen ? <Icons.Shrink /> : <Icons.Expand />, hint: "F", onClick: toggleFullscreen },
  ];

  const volIcon = muted || volume === 0 ? <Icons.Mute /> : volume < 0.5 ? <Icons.VolumeLow /> : <Icons.Volume />;
  const oCount = scene.o_counter || 0;
  const popFresh = pop && Date.now() - pop.n < 2200;

  return (
    <div className="vbs-player-column">
      <div ref={wrapRef} className={"vbs-player" + (showControls ? "" : " vbs-idle") + (fullscreen ? " vbs-fullscreen" : "")}
        onPointerMove={(e) => e.pointerType === "mouse" && poke()} onPointerLeave={() => playing && setVisible(false)}
        onContextMenu={(e) => ctx.open(e, playerMenu())}>
        <video ref={videoRef} data-vibings-scene-id={scene.id} playsInline preload="metadata"
          poster={scene.paths?.screenshot || undefined} onError={onError}
          onClick={onVideoClick} onDoubleClick={(e) => { if (!e.nativeEvent.pointerType || e.nativeEvent.pointerType === "mouse") toggleFullscreen(); }}
          onPointerDown={onVideoPointerDown} onPointerMove={onVideoPointerMove} onPointerUp={onVideoPointerUp}
          onPointerCancel={(e) => endGesture(e)} />

        {!started && !playing && (
          <button type="button" className="vbs-bigplay" onClick={togglePlay} aria-label="Play"><Icons.Play /></button>
        )}
        {waiting && playing && <div className="vbs-spinner" />}
        {ripple && Date.now() - ripple.n < 700 && (
          <div key={ripple.n} className={"vbs-ripple " + (ripple.side < 0 ? "vbs-ripple-left" : "vbs-ripple-right")}>
            {ripple.side < 0 ? <Icons.Back /> : <Icons.Forward />}<span>{settings.player.seekStep || 10} s</span>
          </div>
        )}
        {popFresh && (
          <div key={pop.n} className="vbs-o-pop"><Icons.Drop /> O at {fmtTime(pop.t)}</div>
        )}
        {nerds && <NerdStats video={videoRef.current} scene={scene} stream={stream} onClose={() => setNerds(false)} />}
        {marker && <QuickMarker marker={marker} scene={scene} />}
        {shot && <ScreenshotDialog shot={shot} scene={scene} />}
        {swipe?.kind === "x" && (
          <div className={"vbs-swipe" + (swipe.ok ? "" : " vbs-swipe-no")} style={{ transform: "translateX(" + Math.max(-80, Math.min(80, swipe.dx / 3)) + "px)" }}>
            {swipe.dx < 0 ? <Icons.Next /> : <Icons.Prev />}<span>{swipe.label}</span>
          </div>
        )}
        {swipe?.kind === "y" && (
          <div className="vbs-swipe"><Icons.Volume /><span>{Math.round(swipe.level * 100)} %</span></div>
        )}
        <svg className="vbs-svg-defs" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svgFilterMarkup(filters.video) }} />
        {(fullscreen || theater) && (
          <div className="vbs-overlay-title">{sceneTitle(scene)}</div>
        )}

        <div className="vbs-controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Timeline scene={scene} duration={duration} current={current} buffered={buffered} oEvents={oEvents}
            loop={loop} settings={settings.timeline} sprites={sprites} onSeek={seekTo} onScrub={setScrubbing}
            chapters={settings.timeline.chapters ? chapterList : []} />
          <div className="vbs-bar">
            <NavPreview target={current > 5 ? null : prevT} label={current > 5 ? "Back to the start" : "Previous"} queue={queue}>
              <button type="button" className="vbs-btn" onClick={prev} disabled={!hasPrev && current <= 5} aria-label="Previous (Shift+P)"><Icons.Prev /></button>
            </NavPreview>
            <button type="button" className="vbs-btn vbs-btn-main" onClick={togglePlay} title={playing ? "Pause (Space)" : "Play (Space)"}>
              {playing ? <Icons.Pause /> : <Icons.Play />}
            </button>
            <NavPreview target={nextT} label={nextT?.kind === "random" ? "Next (random)" : nextT?.kind === "upnext" ? "Up next" : "Next"} queue={queue}>
              <button type="button" className="vbs-btn" onClick={next} disabled={!hasNext} aria-label="Next (Shift+N)"><Icons.Next /></button>
            </NavPreview>
            <div className="vbs-volume">
              <button type="button" className="vbs-btn" onClick={() => { videoRef.current.muted = !videoRef.current.muted; }} title="Mute (M)">{volIcon}</button>
              <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} aria-label="Volume"
                onChange={(e) => setVol(parseFloat(e.target.value))} />
            </div>
            <span className="vbs-time">{fmtTime(current)} <span className="vbs-dim">/ {fmtTime(duration)}</span></span>
            {chapterNow?.title && (
              <button type="button" className="vbs-chapter-now vbs-hide-sm" onClick={() => setState({ below: "chapters" })} title="Markers">· {chapterNow.title}</button>
            )}
            {!playing && started && (
              <span className="vbs-frame-btns vbs-hide-sm">
                <button type="button" className="vbs-btn" onClick={() => frameStep(-1)} title="One frame back (,)"><Icons.FrameBack /></button>
                <button type="button" className="vbs-btn" onClick={() => takeScreenshot(videoRef.current)} title="Screenshot (Shift+S)"><Icons.Camera /></button>
                <button type="button" className="vbs-btn" onClick={() => frameStep(1)} title="One frame forward (.)"><Icons.FrameForward /></button>
              </span>
            )}
            <span className="vbs-grow" />
            {sleepText && (
              <button type="button" className="vbs-chip-small vbs-sleep" onClick={() => setSleep(null)} title="Sleep timer: click to turn it off"><Icons.Moon /> {sleepText}</button>
            )}
            {upNext.length > 0 && <span className="vbs-chip-small" title="Scenes in up next">{upNext.length} up next</span>}
            <button type="button" className={"vbs-btn vbs-btn-o" + (popFresh ? " vbs-bump" : "")} onClick={recordO} title="Add an O at the current time (O)">
              <Icons.Drop /><span>{oCount}</span>
            </button>
            <div className="vbs-dropdown vbs-hide-sm">
              <button type="button" className={"vbs-btn" + (loop.whole || loop.ab.enabled ? " vbs-on" : "")} onClick={() => setMenu(menu === "loop" ? null : "loop")} title="Loop"><Icons.Loop /></button>
              {menu === "loop" && (
                <div className="vbs-menu vbs-menu-up" onMouseLeave={() => setMenu(null)}>
                  <label className="vbs-menu-row"><input type="checkbox" checked={loop.whole} onChange={() => setLoop({ whole: !loop.whole })} /> Loop the video</label>
                  <label className="vbs-menu-row"><input type="checkbox" checked={loop.ab.enabled} disabled={!(loop.ab.end > loop.ab.start)} onChange={() => setAb({ enabled: !loop.ab.enabled })} /> Loop from A to B</label>
                  <div className="vbs-menu-row">
                    <button type="button" className="vbs-mini" onClick={() => setAb({ start: current, enabled: loop.ab.end > current })}>A {fmtTime(loop.ab.start)}</button>
                    <button type="button" className="vbs-mini" onClick={() => setAb({ end: current, enabled: current > loop.ab.start })}>B {fmtTime(loop.ab.end)}</button>
                  </div>
                  <div className="vbs-menu-hint">[ and ] set A and B, \ turns the loop on or off</div>
                </div>
              )}
            </div>
            <div className="vbs-dropdown vbs-hide-sm">
              <button type="button" className="vbs-btn vbs-btn-text" onClick={() => setMenu(menu === "rate" ? null : "rate")} title="Speed">{rate}×</button>
              {menu === "rate" && (
                <div className="vbs-menu vbs-menu-up" onMouseLeave={() => setMenu(null)}>
                  {RATES.map((r) => (
                    <button key={r} type="button" className={"vbs-menu-item" + (r === rate ? " vbs-selected" : "")}
                      onClick={() => { videoRef.current.playbackRate = r; setMenu(null); }}>{r}×</button>
                  ))}
                </div>
              )}
            </div>
            <div className="vbs-dropdown">
              <button type="button" className={"vbs-btn" + (menu === "settings" ? " vbs-on" : "")} onClick={() => setMenu(menu === "settings" ? null : "settings")} title="Settings"><Icons.Gear /></button>
              {menu === "settings" && (
                <div className="vbs-menu vbs-menu-up vbs-menu-wide" onMouseLeave={() => setMenu(null)}>
                  {streams.length > 1 && (
                    <label className="vbs-menu-row vbs-menu-select">Source
                      <select value={streamIndex} onChange={(e) => {
                        const v = videoRef.current;
                        pending.current = { t: v.currentTime, play: !v.paused };
                        setStreamIndex(Number(e.target.value));
                      }}>
                        {streams.map((s, i) => <option key={s.url} value={i}>{s.label || s.mime_type || "Stream " + (i + 1)}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="vbs-menu-heading">Speed</div>
                  <div className="vbs-menu-row vbs-rates">
                    {RATES.map((r) => (
                      <button key={r} type="button" className={"vbs-mini" + (r === rate ? " vbs-selected" : "")} onClick={() => { videoRef.current.playbackRate = r; }}>{r}×</button>
                    ))}
                  </div>
                  <label className="vbs-menu-row"><input type="checkbox" checked={loop.whole} onChange={() => setLoop({ whole: !loop.whole })} /> Loop the video</label>
                  <label className="vbs-menu-row vbs-menu-select"><span><Icons.Moon /> Sleep timer</span>
                    <select value={sleep?.endOfScene ? "end" : sleep?.minutes ? String(sleep.minutes) : ""} onChange={(e) => setSleep(e.target.value)}>
                      <option value="">Off</option>
                      <option value="end">End of this scene</option>
                      {SLEEP_MINUTES.map((m) => <option key={m} value={String(m)}>{m} min</option>)}
                    </select>
                  </label>
                  <div className="vbs-menu-sep" />
                  <label className="vbs-menu-row"><input type="checkbox" checked={settings.player.autoplay}
                    onChange={() => saveSettings({ player: { autoplay: !settings.player.autoplay } }).catch((e) => toast(e.message, true))} /> Autoplay</label>
                  <label className="vbs-menu-row"><input type="checkbox" checked={!!queue?.continuePlaylist} disabled={!queue?.setContinuePlaylist}
                    onChange={() => queue?.setContinuePlaylist?.(!queue.continuePlaylist)} /> Continue playlist</label>
                  <label className="vbs-menu-row"><input type="checkbox" checked={settings.player.ambient}
                    onChange={() => saveSettings({ player: { ambient: !settings.player.ambient } }).catch((e) => toast(e.message, true))} /> Ambient light</label>
                  <label className="vbs-menu-row"><input type="checkbox" checked={settings.player.normalize}
                    onChange={() => saveSettings({ player: { normalize: !settings.player.normalize } }).catch((e) => toast(e.message, true))} /> Even out loudness</label>
                  <div className="vbs-menu-sep" />
                  <button type="button" className="vbs-menu-item" onClick={() => { setMenu(null); addMarker(); }}><span className="vbs-menu-icon"><Icons.Bookmark /></span>Add a marker here<kbd>B</kbd></button>
                  <button type="button" className="vbs-menu-item" onClick={() => { setMenu(null); takeScreenshot(videoRef.current); }}><span className="vbs-menu-icon"><Icons.Camera /></span>Screenshot<kbd>⇧S</kbd></button>
                  {heatOn && <button type="button" className="vbs-menu-item" onClick={() => { setMenu(null); jumpHottest(); }}><span className="vbs-menu-icon"><Icons.Flame /></span>Most watched part<kbd>H</kbd></button>}
                  <button type="button" className="vbs-menu-item" onClick={() => { setMenu(null); setState({ below: "filters" }); }}><span className="vbs-menu-icon"><Icons.Sliders /></span>Video and audio filters</button>
                  <button type="button" className="vbs-menu-item" onClick={() => { setMenu(null); setNerds(!nerds); }}><span className="vbs-menu-icon"><Icons.Info /></span>Stats for nerds</button>
                  <button type="button" className="vbs-menu-item" onClick={() => { setMenu(null); setState({ panel: "help" }); }}><span className="vbs-menu-icon"><Icons.Keyboard /></span>Keyboard shortcuts</button>
                </div>
              )}
            </div>
            {document.pictureInPictureEnabled && <button type="button" className="vbs-btn vbs-hide-sm" onClick={togglePip} title="Picture in picture"><Icons.Pip /></button>}
            <button type="button" className={"vbs-btn vbs-hide-sm" + (theater ? " vbs-on" : "")} onClick={toggleTheater} title="Theater mode (T)"><Icons.Theater /></button>
            <button type="button" className="vbs-btn" onClick={toggleFullscreen} title="Fullscreen (F)">{fullscreen ? <Icons.Shrink /> : <Icons.Expand />}</button>
          </div>
        </div>
        {ctx.element}
      </div>
      {settings.layout.below && <BelowPlayer scene={scene} />}
    </div>
  );
}
