// Player extras: frame screenshots, quick markers, ambient light, the most
// watched part (Vibings Scene Heatmap) and the sleep timer's fade out.

import { LOG, graphql, client, updateScene } from "./api.js";
import { fmtTime, sceneTitle } from "./format.js";
import { Icons } from "./icons.jsx";
import { hottestTime } from "./logic.js";
import { getDevice, setDevice } from "./settings.js";
import { setState, toast } from "./store.js";
import { Dialog, SafeBox } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const C = PluginApi.components;

// ---------------------------------------------------------------- Screenshot

/** The current frame as a canvas at the video's own size. */
export function captureFrame(video) {
  if (!video?.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
  return c;
}

export function takeScreenshot(video) {
  try {
    const c = captureFrame(video);
    if (!c) return toast("The video has no picture yet", true);
    setState({ shot: { url: c.toDataURL("image/png"), cover: c.toDataURL("image/jpeg", 0.92), t: video.currentTime, w: c.width, h: c.height } });
  } catch (e) {
    console.warn(LOG, e);
    toast("Could not take a screenshot: " + e.message, true);
  }
}

export function ScreenshotDialog({ shot, scene }) {
  const [busy, setBusy] = React.useState(false);
  const close = () => setState({ shot: null });
  const name = (sceneTitle(scene) + " " + fmtTime(shot.t).replace(/:/g, "-")).replace(/[\\/:*?"<>|]+/g, "_") + ".png";
  const copyImage = async () => {
    try {
      const blob = await (await fetch(shot.url)).blob();
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      toast("Image copied");
    } catch (e) {
      toast("Copying images is not available here", true);
    }
  };
  const setCover = async () => {
    setBusy(true);
    try {
      await updateScene(scene.id, { cover_image: shot.cover });
      toast("Cover image set");
      close();
    } catch (e) {
      toast("Could not set the cover: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title={"Screenshot at " + fmtTime(shot.t)} onClose={close} wide>
      <img className="vbs-shot" src={shot.url} alt="" />
      <div className="vbs-dim vbs-small">{shot.w}×{shot.h}</div>
      <div className="vbs-modal-actions">
        <a className="vbs-button" href={shot.url} download={name}><Icons.Save /> Download PNG</a>
        {window.ClipboardItem && <button type="button" className="vbs-button" onClick={copyImage}><Icons.Copy /> Copy</button>}
        <button type="button" className="vbs-button vbs-button-primary" disabled={busy} onClick={setCover}><Icons.Camera /> Set as the scene's cover</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Quick marker

const CREATE_MARKER = "mutation VibingsBetterScenesMarker($input: SceneMarkerCreateInput!) { sceneMarkerCreate(input: $input) { id } }";

function rememberTag(tag) {
  const list = [tag, ...(getDevice().markerTags || []).filter((t) => String(t.id) !== String(tag.id))].slice(0, 8);
  setDevice({ markerTags: list });
}

export function QuickMarker({ marker, scene, onDone }) {
  const [title, setTitle] = React.useState("");
  const [tag, setTag] = React.useState(() => getDevice().markerTags?.[0] || null);
  const [busy, setBusy] = React.useState(false);
  const recent = getDevice().markerTags || [];
  const close = () => { setState({ marker: null }); onDone?.(); };
  const save = async () => {
    if (!tag) return toast("Choose a tag for the marker", true);
    setBusy(true);
    try {
      await graphql(CREATE_MARKER, { input: { scene_id: String(scene.id), seconds: marker.t, title: title.trim(), primary_tag_id: String(tag.id), tag_ids: [] } });
      rememberTag({ id: String(tag.id), name: tag.name });
      await client()?.refetchQueries?.({ include: ["FindScene"] });
      toast("Marker added at " + fmtTime(marker.t));
      close();
    } catch (e) {
      console.warn(LOG, e);
      toast("Could not add the marker: " + e.message, true);
      setBusy(false);
    }
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Enter" && !e.target.closest?.("[class*=-menu]")) { e.preventDefault(); save(); }
  };
  return (
    <div className="vbs-quick-marker" onKeyDown={onKey} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="vbs-qm-head"><Icons.Bookmark /> <strong>Marker at {fmtTime(marker.t)}</strong><span className="vbs-grow" />
        <button type="button" className="vbs-nerds-close" onClick={close} aria-label="Close"><Icons.Close /></button></div>
      <input className="vbs-input" autoFocus placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      {recent.length > 0 && (
        <div className="vbs-qm-tags">
          {recent.map((t) => (
            <button key={t.id} type="button" className={"vbs-mini" + (String(tag?.id) === String(t.id) ? " vbs-selected" : "")} onClick={() => setTag(t)}>{t.name}</button>
          ))}
        </div>
      )}
      {C.TagSelect && (
        <SafeBox message="The tag list is not available">
          <div className="vbs-qm-select">
            <C.TagSelect isMulti={false} values={tag ? [tag] : []} onSelect={(items) => setTag(items?.[0] || null)}
              menuPortalTarget={document.fullscreenElement || document.body} noSelectionString="Primary tag" />
          </div>
        </SafeBox>
      )}
      <div className="vbs-qm-actions">
        <span className="vbs-dim vbs-small">Enter saves, Esc closes</span><span className="vbs-grow" />
        <button type="button" className="vbs-button vbs-button-primary" disabled={busy || !tag} onClick={save}>Add marker</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Ambient light

/** The video's colours glow around the player (a box shadow per side, sampled a few times a second). */
export function useAmbient(videoRef, wrapRef, enabled) {
  React.useEffect(() => {
    const v = videoRef.current;
    const wrap = wrapRef.current;
    if (!enabled || !v || !wrap) {
      if (wrap) wrap.style.boxShadow = "";
      return undefined;
    }
    const c = document.createElement("canvas");
    c.width = 12;
    c.height = 8;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const avg = (data, x0, y0, x1, y1) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * c.width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      const k = 1.25 / n; // a little brighter than the picture
      return Math.min(255, Math.round(r * k)) + "," + Math.min(255, Math.round(g * k)) + "," + Math.min(255, Math.round(b * k));
    };
    const sample = () => {
      if (!v.videoWidth || v.readyState < 2) return;
      try {
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const left = avg(d, 0, 0, 4, 8), right = avg(d, 8, 0, 12, 8), top = avg(d, 0, 0, 12, 3), bottom = avg(d, 0, 5, 12, 8);
        wrap.style.boxShadow = [
          "-70px 0 120px -30px rgba(" + left + ",0.55)",
          "70px 0 120px -30px rgba(" + right + ",0.55)",
          "0 -50px 110px -30px rgba(" + top + ",0.45)",
          "0 60px 130px -30px rgba(" + bottom + ",0.5)",
        ].join(", ");
      } catch {
        /* a frame that cannot be read */
      }
    };
    const timer = setInterval(() => { if (!v.paused) sample(); }, 300);
    v.addEventListener("seeked", sample);
    v.addEventListener("loadeddata", sample);
    sample();
    return () => {
      clearInterval(timer);
      v.removeEventListener("seeked", sample);
      v.removeEventListener("loadeddata", sample);
      wrap.style.boxShadow = "";
    };
  }, [enabled]);
}

// ---------------------------------------------------------------- Most watched part

export const sceneHeatmap = () => window.VibingsSceneHeatmap || null;

/** Start of the scene's most watched part, or null (no Vibings Scene Heatmap or too little data). */
export async function hottest(sceneId, duration) {
  const api = sceneHeatmap();
  if (!api?.getHeat) return null;
  let heat = api.getHeat(sceneId);
  if (!heat.loaded && api.loadHeat) heat = await api.loadHeat(sceneId);
  return hottestTime(heat?.bins, duration || heat?.d);
}

// ---------------------------------------------------------------- Sleep timer

/** Turns the volume down over a few seconds, pauses and puts the volume back. */
export function fadeOutAndPause(video, onDone, seconds = 5) {
  const start = video.volume;
  const steps = 25;
  let n = 0;
  video.dataset.vbsFading = "1";
  const timer = setInterval(() => {
    n++;
    video.volume = Math.max(0, start * (1 - n / steps));
    if (n >= steps) {
      clearInterval(timer);
      video.pause();
      video.volume = start;
      delete video.dataset.vbsFading;
      onDone?.();
    }
  }, (seconds * 1000) / steps);
}
