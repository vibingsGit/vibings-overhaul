// The queue: "up next" (this tab's own list, played first) and Stash's queue
// (the scene list the scene was opened from).
//
// Rows are dragged by their handle (mouse or touch). Dropping a scene into
// the up next part puts it there at that place; dropping an up next scene
// into the queue part takes it out of up next again.
//
// Queues can be saved by name (on the server) and played again later, or
// saved as a Stash group.

import { fmtTime, sceneTitle } from "./format.js";
import { Icons } from "./icons.jsx";
import { graphql, createGroupFromScenes } from "./api.js";
import { useStore, toast } from "./store.js";
import { useSettings, saveSettings, useLibrary, updateLibrary } from "./settings.js";
import { playOrder, queueLink } from "./logic.js";
import { useUpNext, removeFromQueue, clearQueue, sceneUrl, setUpNext, dropOrder } from "./queue.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Link } = PluginApi.libraries.ReactRouterDOM;

function useScenesById(ids) {
  const [byId, setById] = React.useState(new Map());
  const key = ids.join(",");
  React.useEffect(() => {
    if (!ids.length) return undefined;
    let live = true;
    graphql("query VibingsBetterScenesQueue($ids: [Int!]) { findScenes(scene_ids: $ids, filter: { per_page: -1 }) { scenes { id title paths { screenshot } files { path duration } performers { id name } } } }", { ids: ids.map(Number) })
      .then((d) => live && setById(new Map(d.findScenes.scenes.map((s) => [String(s.id), s]))))
      .catch(() => {});
    return () => { live = false; };
  }, [key]);
  return byId;
}

function Row({ scene, current, index, children, onClick, onGrab, dragging, rowRef }) {
  return (
    <li ref={rowRef} className={"vbs-q-row" + (current ? " vbs-q-current" : "") + (dragging ? " vbs-q-dragging" : "")} data-id={scene.id}>
      <span className="vbs-q-grip" onPointerDown={onGrab} title="Drag to move" aria-label="Drag to move">⠿</span>
      <span className="vbs-q-index">{current ? <Icons.Play /> : index}</span>
      <Link to={sceneUrl(scene.id)} className="vbs-q-main" onClick={onClick} draggable={false}>
        {scene.paths?.screenshot ? <img src={scene.paths.screenshot} alt="" loading="lazy" draggable={false} /> : <span className="vbs-q-noimg" />}
        <span className="vbs-q-text">
          <span className="vbs-q-title">{sceneTitle(scene)}</span>
          <span className="vbs-q-sub">{fmtTime(scene.files?.[0]?.duration)}{scene.performers?.length ? " · " + scene.performers.map((p) => p.name).join(", ") : ""}</span>
        </span>
      </Link>
      <span className="vbs-q-actions">{children}</span>
    </li>
  );
}

function SavedQueues({ order }) {
  const library = useLibrary();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(null);
  const [group, setGroup] = React.useState(null); // { id, name } just made
  const fail = (e) => toast("Could not save: " + e.message, true);
  const defaultName = () => "Queue " + new Date().toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  const save = () => {
    const n = name.trim() || defaultName();
    updateLibrary((l) => ({ ...l, queues: [{ name: n, ids: order, at: new Date().toISOString() }, ...l.queues.filter((q) => q.name !== n)] }))
      .then(() => { setName(""); toast("Queue saved"); }).catch(fail);
  };
  const remove = (n) => updateLibrary((l) => ({ ...l, queues: l.queues.filter((q) => q.name !== n) })).catch(fail);
  const asGroup = async (n, ids) => {
    setBusy(n);
    try {
      const id = await createGroupFromScenes(n, ids);
      setGroup({ id, name: n });
      toast("Group created");
    } catch (e) {
      toast("Could not create the group: " + e.message, true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="vbs-q-section">
      <div className="vbs-q-head"><h4>Saved queues <span className="vbs-dim">{library.queues.length || ""}</span></h4></div>
      <div className="vbs-q-save">
        <input className="vbs-input" placeholder={order.length ? "Name for this queue" : "No queue to save"} value={name} disabled={!order.length}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        <button type="button" className="vbs-mini" disabled={!order.length} onClick={save}><Icons.Save /> Save</button>
        <button type="button" className="vbs-mini" disabled={!order.length || !!busy} onClick={() => asGroup(name.trim() || defaultName(), order)} title="Save as a Stash group">
          <Icons.Group /> As group</button>
      </div>
      {group && <p className="vbs-small">Group created: <Link to={"/groups/" + group.id}>{group.name}</Link></p>}
      {library.queues.length > 0 && (
        <ul className="vbs-saved-queues">
          {library.queues.map((q) => (
            <li key={q.name}>
              <Link to={queueLink(q.ids)} className="vbs-saved-name" title="Play this queue"><Icons.Play /> {q.name}</Link>
              <span className="vbs-dim vbs-small">{q.ids.length} {q.ids.length === 1 ? "scene" : "scenes"}</span>
              <button type="button" className="vbs-icon-btn" disabled={!!busy} onClick={() => asGroup(q.name, q.ids)} title="Save as a Stash group"><Icons.Group /></button>
              <button type="button" className="vbs-icon-btn vbs-danger" onClick={() => remove(q.name)} aria-label="Delete"><Icons.Trash /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QueuePanel({ scene }) {
  const settings = useSettings();
  const queue = useStore((s) => s.queue);
  const upNext = useUpNext();
  const upScenes = useScenesById(upNext);
  const currentRef = React.useRef(null);
  const listRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null); // { id, index }
  const scenes = queue?.scenes || [];
  const upSet = new Set(upNext);

  React.useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [scene.id, scenes.length]);

  // Drop position: the gap nearest to the pointer, counted over all draggable rows.
  const indexAt = (y) => {
    const rows = [...listRef.current.querySelectorAll(".vbs-q-row[data-drop]")];
    let i = 0;
    for (const r of rows) {
      const box = r.getBoundingClientRect();
      if (y > box.top + box.height / 2) i = +r.dataset.drop + 1;
    }
    return i;
  };

  const grab = (id) => (e) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    setDrag({ id: String(id), index: indexAt(e.clientY) });
    const move = (ev) => {
      setDrag((d) => d && { ...d, index: indexAt(ev.clientY) });
      const box = listRef.current.closest(".vbs-side-body")?.getBoundingClientRect();
      if (box && ev.clientY < box.top + 40) listRef.current.closest(".vbs-side-body").scrollTop -= 12;
      if (box && ev.clientY > box.bottom - 40) listRef.current.closest(".vbs-side-body").scrollTop += 12;
    };
    const up = (ev) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      const index = indexAt(ev.clientY);
      setDrag(null);
      if (ev.type === "pointerup") setUpNext(dropOrder(upNext, String(id), index));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  // Rows that can be dragged: up next, then the queue scenes after the current one.
  const i = scenes.findIndex((s) => String(s.id) === String(scene.id));
  const following = scenes.slice(i + 1).filter((s) => !upSet.has(String(s.id)));
  let n = 0;
  const marker = (at) => drag && drag.index === at ? <li className="vbs-q-drop" aria-hidden="true" /> : null;

  return (
    <div className="vbs-queue" ref={listRef}>
      <div className="vbs-q-toggles">
        <label><input type="checkbox" checked={!!queue?.continuePlaylist} disabled={!queue?.setContinuePlaylist}
          onChange={() => queue.setContinuePlaylist(!queue.continuePlaylist)} /> Continue to the next scene</label>
        <label><input type="checkbox" checked={settings.queue.shuffle}
          onChange={() => saveSettings({ queue: { shuffle: !settings.queue.shuffle } })} /> Randomize the next scene</label>
        <label><input type="checkbox" checked={settings.queue.repeat} disabled={settings.queue.shuffle}
          onChange={() => saveSettings({ queue: { repeat: !settings.queue.repeat } })} /> Repeat the queue</label>
      </div>

      <div className="vbs-q-section">
        <div className="vbs-q-head">
          <h4>Up next <span className="vbs-dim">{upNext.length || ""}</span></h4>
          {upNext.length > 0 && <button type="button" className="vbs-link-btn" onClick={clearQueue}>Clear</button>}
        </div>
        <ol className="vbs-q-list">
          {upNext.map((id) => {
            const s = upScenes.get(id);
            const at = n++;
            if (!s) return null;
            return (
              <React.Fragment key={"u" + id}>
                {marker(at)}
                <Row scene={s} index={at + 1} onClick={() => removeFromQueue(id)} onGrab={grab(id)} dragging={drag?.id === id}
                  rowRef={(el) => el && (el.dataset.drop = at)}>
                  <button type="button" className="vbs-icon-btn vbs-danger" onClick={() => removeFromQueue(id)} aria-label="Remove"><Icons.Close /></button>
                </Row>
              </React.Fragment>
            );
          })}
          {marker(upNext.length)}
          {!upNext.length && !drag && (
            <li className="vbs-q-hint">Drag a scene here, or right click (long press) a scene and choose Play next. These play first, each once.</li>
          )}
        </ol>
      </div>

      <div className="vbs-q-section">
        <div className="vbs-q-head">
          <h4>Queue <span className="vbs-dim">{scenes.length || ""}</span></h4>
          {scenes.length > 1 && queue?.onRandom && (
            <button type="button" className="vbs-link-btn" onClick={queue.onRandom} title="Play a random scene from the queue"><Icons.Shuffle /> Random</button>
          )}
        </div>
        {queue?.start > 1 && queue?.onLessScenes && <button type="button" className="vbs-link-btn vbs-q-more" onClick={queue.onLessScenes}>Show earlier scenes</button>}
        {scenes.length ? (
          <ol className="vbs-q-list">
            {scenes.slice(0, i + 1).map((s, k) => {
              const current = k === i;
              return (
                <Row key={s.id} rowRef={current ? currentRef : null} scene={s} current={current} index={(queue.start || 1) + k}
                  onGrab={grab(s.id)} dragging={drag?.id === String(s.id)}
                  onClick={(e) => { if (queue.onSceneClicked) { e.preventDefault(); queue.onSceneClicked(String(s.id)); } }} />
              );
            })}
            {following.map((s) => {
              const at = n++;
              return (
                <Row key={s.id} scene={s} index={(queue.start || 1) + scenes.indexOf(s)} onGrab={grab(s.id)} dragging={drag?.id === String(s.id)}
                  rowRef={(el) => el && (el.dataset.drop = at)}
                  onClick={(e) => { if (queue.onSceneClicked) { e.preventDefault(); queue.onSceneClicked(String(s.id)); } }} />
              );
            })}
          </ol>
        ) : <p className="vbs-dim vbs-small">No queue. Open a scene from a scene list to play the list in order.</p>}
        {queue?.hasMore && queue?.onMoreScenes && <button type="button" className="vbs-link-btn vbs-q-more" onClick={queue.onMoreScenes}>Show more scenes</button>}
      </div>
      <SavedQueues order={playOrder(scene.id, upNext, scenes)} />
    </div>
  );
}
