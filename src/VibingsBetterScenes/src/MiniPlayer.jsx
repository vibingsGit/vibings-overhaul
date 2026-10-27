// Mini player: leaving the scene page while the video plays moves the same
// <video> element into a small player in the corner, so playback, filters,
// play tracking and the heatmap recording carry on. Its expand button opens
// the scene page again at the same time.

import { fmtTime, sceneTitle } from "./format.js";
import { Icons } from "./icons.jsx";
import { getState, setState } from "./store.js";
import { sleepLeft } from "./logic.js";
import { fadeOutAndPause } from "./PlayerTools.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const ReactDOM = PluginApi.ReactDOM;

let open = null; // { host, root, video, sceneId, stop }

// The <video> sits in a plain element of the host (moved there at once, so
// it never leaves the page and does not pause); React renders the controls.
function MiniControls({ video, scene, onExpand, onClose }) {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const update = () => tick((n) => n + 1);
    const events = ["play", "pause", "timeupdate", "ended"];
    events.forEach((e) => video.addEventListener(e, update));
    // The sleep timer keeps running here.
    const sleep = setInterval(() => {
      const s = getState().sleep;
      if (s?.until && sleepLeft(s) === 0 && !video.paused && !video.dataset.vbsFading) {
        setState({ sleep: null });
        fadeOutAndPause(video);
      }
    }, 1000);
    const onEnded = () => { if (getState().sleep?.endOfScene) setState({ sleep: null }); };
    video.addEventListener("ended", onEnded);
    return () => {
      events.forEach((e) => video.removeEventListener(e, update));
      video.removeEventListener("ended", onEnded);
      clearInterval(sleep);
    };
  }, []);
  const d = Number.isFinite(video.duration) ? video.duration : 0;
  const seek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (d) video.currentTime = ((e.clientX - r.left) / r.width) * d;
  };
  const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  return (
    <>
      <div className="vbs-mini-bar">
        <button type="button" className="vbs-btn" onClick={toggle} aria-label={video.paused ? "Play" : "Pause"}>{video.paused ? <Icons.Play /> : <Icons.Pause />}</button>
        <div className="vbs-mini-text" title={sceneTitle(scene)}>
          <span className="vbs-mini-title">{sceneTitle(scene)}</span>
          <span className="vbs-mini-time">{fmtTime(video.currentTime)} / {fmtTime(d)}</span>
        </div>
        <button type="button" className="vbs-btn" onClick={onExpand} title="Back to the scene"><Icons.Expand /></button>
        <button type="button" className="vbs-btn" onClick={onClose} title="Close"><Icons.Close /></button>
      </div>
      <div className="vbs-mini-track" onClick={seek}><div style={{ width: (d ? (video.currentTime / d) * 100 : 0) + "%" }} /></div>
    </>
  );
}

function render(host, element) {
  if (ReactDOM.createRoot) {
    const root = ReactDOM.createRoot(host);
    root.render(element);
    return () => root.unmount();
  }
  ReactDOM.render(element, host);
  return () => ReactDOM.unmountComponentAtNode(host);
}

/**
 * Moves `video` (playing) into the mini player. stop() ends its play
 * tracking; history and url bring the scene page back.
 */
export function openMini({ video, scene, stop, history, url }) {
  closeMini();
  const host = document.createElement("div");
  host.className = "vbs-mini-player";
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Mini player");
  const box = document.createElement("div");
  box.className = "vbs-mini-video";
  const controls = document.createElement("div");
  controls.className = "vbs-mini-controls";
  host.append(box, controls);
  document.body.appendChild(host);
  box.appendChild(video);
  const expand = () => {
    const info = closeMini();
    if (info) setState({ handoff: info });
    history.push(url);
  };
  const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  box.addEventListener("click", toggle);
  box.addEventListener("dblclick", expand);
  const unmount = render(controls, <MiniControls video={video} scene={scene} onExpand={expand} onClose={() => closeMini()} />);
  open = { host, unmount, video, sceneId: String(scene.id), stop };
}

/** Closes the mini player; returns { sceneId, t, play } of what it was playing, or null. */
export function closeMini() {
  if (!open) return null;
  const { host, unmount, video, sceneId, stop } = open;
  open = null;
  const info = { sceneId, t: video.currentTime, play: !video.paused && !video.ended };
  video.pause();
  try { stop?.(); } catch { /* tracking already stopped */ }
  try { unmount(); } catch { /* already unmounted */ }
  host.remove();
  video.removeAttribute("src");
  video.load();
  return info;
}

export const miniOpen = () => !!open;
