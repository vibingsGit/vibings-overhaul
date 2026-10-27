// A short play summary at the top of the scene page's History tab: plays and
// play time this plugin counted, and the estimated earlier plays (hybrid)
// or the original earlier plays (replace).

import { LOG, backend, fmtDuration } from "./api.js";
import { splitHistory } from "./estimate.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

export const HISTORY_TAB = "scene-history-panel";

// refreshKey changes when Stash's play data for the scene changes.
function useSceneData(sceneId, refreshKey) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    backend("get_scene", { sceneId }).then((d) => live && setData(d)).catch((e) => console.warn(LOG, e?.message || e));
    return () => { live = false; };
  }, [sceneId, refreshKey]);
  return data;
}

export function SceneCard({ scene }) {
  const data = useSceneData(scene.id, scene.play_count || 0);
  if (!data) return null;
  const { later } = splitHistory(scene.play_history, data.installedAt);
  const since = new Date(data.installedAt).toLocaleDateString();
  const items = [];
  if (data.estimate != null) {
    items.push(["Earlier plays (estimated)", data.estimate, "before " + since + ", from earlier play time"]);
  }
  if (data.originalPlays != null) {
    items.push(["Earlier plays replaced", "", "an estimate; originally " + data.originalPlays]);
  }
  items.push(["Plays since " + since, later.length, fmtDuration(data.tracked.s) + " played"]);
  return (
    <div className="vpt-scene">
      {items.map(([label, value, note]) => (
        <div key={label} className="vpt-scene-item">
          <span className="vpt-scene-label">{label}</span>
          {value !== "" && <span className="vpt-scene-value">{value}</span>}
          <span className="vpt-scene-note">{note}</span>
        </div>
      ))}
    </div>
  );
}

/** Puts the card at the top of the History tab's pane in ScenePage.TabContent's children. */
export function withHistoryCard(children, scene) {
  let found = false;
  const visit = (node) => React.Children.map(node, (el) => {
    if (!React.isValidElement(el)) return el;
    if (el.props?.eventKey === HISTORY_TAB) {
      found = true;
      return React.cloneElement(el, {}, <><SceneCard scene={scene} />{el.props.children}</>);
    }
    if (el.type === React.Fragment) return React.cloneElement(el, {}, visit(el.props.children));
    return el;
  });
  const out = visit(children);
  return found ? out : children;
}
