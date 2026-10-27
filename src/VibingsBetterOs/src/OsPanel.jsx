// "Os" tab on the scene page: every O of the scene, its video position, and
// tools to add, adjust or remove them. Os without a position are classic Os.

import { LOG, fmtPos, parsePos, fmtDateTime, timeAgo } from "./api.js";
import { useScene, rows } from "./store.js";
import { currentPosition, seek, getPlayer } from "./player.js";
import { addSceneO, deleteSceneO, setScenePosition, clearScenePosition } from "./tracker.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Badge } = PluginApi.libraries.Bootstrap;
const { faPlus, faCrosshairs, faPen, faXmark, faTrash, faCheck, faPlay } = PluginApi.libraries.FontAwesomeSolid;

export const TAB_KEY = "scene-vibings-os-panel";

const Icon = ({ icon }) => <PluginApi.components.Icon icon={icon} className="fa-fw" />;

// Re-renders every second so "Add O at 4:05" follows the video.
function usePlayerTime(sceneId) {
  const [pos, setPos] = React.useState(() => currentPosition(sceneId));
  React.useEffect(() => {
    const t = setInterval(() => setPos(currentPosition(sceneId)), 1000);
    return () => clearInterval(t);
  }, [sceneId]);
  return pos;
}

function Strip({ events, duration, flashAt }) {
  if (!duration) return null;
  const timed = events.filter((e) => e.t != null);
  return (
    <div className="vbo-strip" aria-label="O positions in the video">
      {timed.map((e) => (
        <button key={e.at} type="button" className={`vbo-strip-dot${e.at === flashAt ? " vbo-marker-new" : ""}`}
          style={{ left: `${Math.min(100, (e.t / duration) * 100)}%` }}
          title={`${fmtPos(e.t)} · ${fmtDateTime(e.at)}`} onClick={() => seek(e.t)} />
      ))}
      <span className="vbo-strip-start">0:00</span>
      <span className="vbo-strip-end">{fmtPos(duration)}</span>
    </div>
  );
}

function Row({ sceneId, index, at, event, duration, flash, busy, run }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const timed = event && event.t != null;
  const pos = currentPosition(sceneId);

  const save = () => {
    const t = parsePos(text);
    if (t == null || (duration && t > duration + 1)) return;
    run(() => setScenePosition(sceneId, at, t)).then(() => setEditing(false));
  };

  return (
    <li className={`vbo-row${flash ? " vbo-row-new" : ""}`}>
      <span className="vbo-row-n">{index}</span>
      <span className="vbo-row-when">
        <span>{fmtDateTime(at)}</span>
        <span className="vbo-muted">{timeAgo(at)}</span>
      </span>
      <span className="vbo-row-pos">
        {editing ? (
          <form className="vbo-edit" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input className="form-control form-control-sm" autoFocus value={text} placeholder="m:ss"
              onChange={(e) => setText(e.target.value)} aria-label="Video position" />
            <Button size="sm" variant="primary" type="submit" disabled={busy || parsePos(text) == null} title="Save"><Icon icon={faCheck} /></Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} title="Cancel"><Icon icon={faXmark} /></Button>
          </form>
        ) : timed ? (
          <button type="button" className="vbo-pos" onClick={() => seek(event.t)} title="Play from here">
            <Icon icon={faPlay} /> {fmtPos(event.t)}
            {duration ? <span className="vbo-muted"> · {Math.round((event.t / duration) * 100)}%</span> : null}
          </button>
        ) : (
          <Badge variant="secondary" className="vbo-classic" title="Added before Vibings Better Os, or without a video position">Classic O</Badge>
        )}
      </span>
      <span className="vbo-row-actions">
        {!editing && !confirmDelete && (
          <>
            {pos && (
              <Button size="sm" variant="minimal" disabled={busy} title={`Set position to ${fmtPos(pos.t)}`}
                onClick={() => run(() => setScenePosition(sceneId, at, pos.t))}><Icon icon={faCrosshairs} /></Button>
            )}
            <Button size="sm" variant="minimal" disabled={busy} title="Type a position"
              onClick={() => { setText(timed ? fmtPos(event.t) : ""); setEditing(true); }}><Icon icon={faPen} /></Button>
            {timed && (
              <Button size="sm" variant="minimal" disabled={busy} title="Remove the position (keeps the O as a classic O)"
                onClick={() => run(() => clearScenePosition(sceneId, at))}><Icon icon={faXmark} /></Button>
            )}
            <Button size="sm" variant="minimal" className="vbo-danger" disabled={busy} title="Delete this O"
              onClick={() => setConfirmDelete(true)}><Icon icon={faTrash} /></Button>
          </>
        )}
        {confirmDelete && (
          <span className="vbo-confirm">
            Delete this O?
            <Button size="sm" variant="danger" disabled={busy}
              onClick={() => run(() => deleteSceneO(sceneId, at)).then(() => setConfirmDelete(false))}>Delete</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </span>
        )}
      </span>
    </li>
  );
}

export function OsPanel({ scene }) {
  const sceneId = String(scene.id);
  const state = useScene(sceneId);
  const pos = usePlayerTime(sceneId);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const list = rows(state);
  const timed = state.events.filter((e) => e.t != null).length;
  const playerDuration = Number(getPlayer()?.duration?.());
  const duration = state.duration || (playerDuration > 0 ? playerDuration : null);
  const flashAt = state.flash && Date.now() - state.flash.n < 4000 ? state.flash.at : null;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.warn(LOG, e);
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vbo-panel">
      <div className="vbo-head">
        <div className="vbo-summary">
          <strong>{list.length} {list.length === 1 ? "O" : "Os"}</strong>
          {list.length > 0 && <span className="vbo-muted"> · {timed} with position · {list.length - timed} classic</span>}
        </div>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => addSceneO(sceneId, "panel"))}
          title={pos ? "Adds an O at the current video position" : "Start the video to store its position"}>
          <Icon icon={faPlus} /> {pos ? `Add O at ${fmtPos(pos.t)}` : "Add O"}
        </Button>
      </div>
      <Strip events={state.events} duration={duration} flashAt={flashAt} />
      {error && <div className="vbo-error">{error}</div>}
      {state.error && <div className="vbo-error">Could not load the Os: {state.error}</div>}
      {!state.loaded ? (
        <div className="vbo-muted">Loading…</div>
      ) : list.length === 0 ? (
        <div className="vbo-muted vbo-empty">No Os yet. An O added while the video plays stores its position.</div>
      ) : (
        <ol className="vbo-list">
          {list.map((r, i) => (
            <Row key={r.at} sceneId={sceneId} index={list.length - i} at={r.at} event={r.event} duration={duration}
              flash={r.at === flashAt} busy={busy} run={run} />
          ))}
        </ol>
      )}
    </div>
  );
}

/** Tab title with the scene's O count. */
export function OsTabTitle({ scene }) {
  const state = useScene(String(scene.id));
  const n = state.loaded ? state.history.length : scene.o_counter || 0;
  return (
    <>
      Os{n > 0 && <Badge pill variant="secondary" className="vbo-tab-count">{n}</Badge>}
    </>
  );
}
