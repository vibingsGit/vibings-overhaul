// Hovering the previous / next buttons shows the scene that would load.

import { graphql } from "./api.js";
import { fmtTime, sceneTitle } from "./format.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const cache = new Map(); // id -> Promise<scene>

function loadScene(id) {
  if (!cache.has(id)) {
    cache.set(id, graphql("query VibingsBetterScenesPreview($id: ID!) { findScene(id: $id) { id title paths { screenshot } files { path duration } performers { id name } } }", { id })
      .then((d) => d.findScene)
      .catch(() => null));
  }
  return cache.get(id);
}

export function NavPreview({ target, label, queue, children }) {
  const [open, setOpen] = React.useState(false);
  const [scene, setScene] = React.useState(null);
  const id = target?.id ? String(target.id) : null;

  React.useEffect(() => {
    setScene(null);
    if (!open || !id) return undefined;
    const known = queue?.scenes?.find((s) => String(s.id) === id);
    if (known?.paths) { setScene(known); return undefined; }
    let live = true;
    loadScene(id).then((s) => live && setScene(s));
    return () => { live = false; };
  }, [open, id]);

  return (
    <span className="vbs-nav" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {children}
      {open && (id || label === "Back to the start") && (
        <span className="vbs-nav-preview" role="tooltip">
          <span className="vbs-nav-label">{label}</span>
          {scene && (
            <>
              {scene.paths?.screenshot && <img src={scene.paths.screenshot} alt="" />}
              <span className="vbs-nav-title">{sceneTitle(scene)}</span>
              <span className="vbs-nav-sub">{[fmtTime(scene.files?.[0]?.duration), (scene.performers || []).map((p) => p.name).join(", ")].filter(Boolean).join(" · ")}</span>
            </>
          )}
          {!scene && id && <span className="vbs-nav-sub">Loading…</span>}
        </span>
      )}
    </span>
  );
}
