// The scene page's player (video.js or a custom one), and the image that is open right now.

export function sceneIdFromPath(pathname = location.pathname) {
  const m = pathname.match(/^\/scenes\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

export function getVideoJsPlayer() {
  return document.querySelector(".video-js")?.player || null;
}

// Other scene players (such as Vibings Better Scenes) mark their <video>
// element with data-vibings-scene-id; it gets the same small API as video.js.
function customPlayer() {
  const v = document.querySelector("video[data-vibings-scene-id]");
  if (!v) return null;
  return {
    custom: true,
    sceneId: v.dataset.vibingsSceneId,
    currentTime: (t) => (t === undefined ? v.currentTime : (v.currentTime = t)),
    duration: () => v.duration,
    paused: () => v.paused,
    play: () => v.play(),
    played: () => v.played,
    isDisposed: () => !v.isConnected,
  };
}

/** The scene page's player: video.js, or a custom player's <video>. */
export function getPlayer() {
  return getVideoJsPlayer() || customPlayer();
}

/** { t, d } of the player when it shows this scene and has been played; else null. */
export function currentPosition(sceneId) {
  if (sceneIdFromPath() !== String(sceneId)) return null;
  const player = getPlayer();
  if (!player || player.isDisposed?.()) return null;
  const t = Number(player.currentTime());
  const d = Number(player.duration());
  const started = t > 0 || player.played?.().length > 0;
  if (!started || !Number.isFinite(t)) return null;
  return { t, d: Number.isFinite(d) && d > 0 ? d : null };
}

export function seek(t) {
  const player = getPlayer();
  if (!player) return false;
  player.currentTime(t);
  if (player.paused()) player.play()?.catch?.(() => {});
  return true;
}

// ---------------------------------------------------------------- Images

// How long the image that is open now (lightbox or image page) has been on
// screen. Time while the browser tab is hidden does not count.
let session = null; // { id, ms, last }

function openImageId() {
  const link = document.querySelector(".Lightbox a.image-link[href^='/images/']");
  if (link) return link.getAttribute("href").split("/")[2] || null;
  const m = location.pathname.match(/^\/images\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

function tick() {
  const now = performance.now();
  const id = openImageId();
  if (!id) {
    session = null;
  } else if (!session || session.id !== id) {
    session = { id, ms: 0, last: now };
  } else {
    if (document.visibilityState === "visible") session.ms += now - session.last;
    session.last = now;
  }
}

let timer = null;
export function startImageSessions() {
  if (timer) return;
  timer = setInterval(tick, 500);
  document.addEventListener("visibilitychange", tick);
}

/** Seconds the image has been open, or null when it is not the open one. */
export function imageViewSeconds(imageId) {
  tick();
  return session && session.id === String(imageId) ? Math.round(session.ms / 100) / 10 : null;
}
