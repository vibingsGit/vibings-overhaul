// Quick edit in the Overview: title, date, studio, performers, tags and
// details, with Stash's own pickers. Saved with Stash's scene update, so the
// page updates at once. Everything else stays in the Stash tab → Edit.

import { LOG, updateScene } from "./api.js";
import { Icons } from "./icons.jsx";
import { toast } from "./store.js";
import { SafeBox } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const C = PluginApi.components;

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function Pickers({ draft, set }) {
  // PerformerSelect is loaded on demand by Stash.
  const loadable = PluginApi.loadableComponents?.PerformerSelect;
  const loading = PluginApi.hooks?.useLoadComponents ? PluginApi.hooks.useLoadComponents(loadable ? [loadable] : []) : false;
  if (loading) return <div className="vbs-dim vbs-small">Loading…</div>;
  const portal = document.body;
  return (
    <>
      {C.StudioSelect && (
        <div className="vbs-edit-field"><span>Studio</span>
          <C.StudioSelect isMulti={false} isClearable values={draft.studio ? [draft.studio] : []} menuPortalTarget={portal}
            onSelect={(items) => set({ studio: items?.[0] || null })} />
        </div>
      )}
      {C.PerformerSelect && (
        <div className="vbs-edit-field"><span>Performers</span>
          <C.PerformerSelect isMulti values={draft.performers} menuPortalTarget={portal} onSelect={(items) => set({ performers: items || [] })} />
        </div>
      )}
      {C.TagSelect && (
        <div className="vbs-edit-field"><span>Tags</span>
          <C.TagSelect isMulti values={draft.tags} menuPortalTarget={portal} onSelect={(items) => set({ tags: items || [] })} />
        </div>
      )}
    </>
  );
}

export function QuickEdit({ scene, onDone }) {
  const [draft, setDraft] = React.useState(() => ({
    title: scene.title || "",
    date: scene.date || "",
    details: scene.details || "",
    studio: scene.studio || null,
    performers: scene.performers || [],
    tags: scene.tags || [],
  }));
  const [busy, setBusy] = React.useState(false);
  const set = (changes) => setDraft((d) => ({ ...d, ...changes }));
  const dateOk = !draft.date.trim() || DATE.test(draft.date.trim());
  const save = async () => {
    if (!dateOk) return toast("The date is YYYY, YYYY-MM or YYYY-MM-DD", true);
    setBusy(true);
    try {
      await updateScene(scene.id, {
        title: draft.title.trim(),
        date: draft.date.trim() || null,
        details: draft.details,
        studio_id: draft.studio ? String(draft.studio.id) : null,
        performer_ids: draft.performers.map((p) => String(p.id)),
        tag_ids: draft.tags.map((t) => String(t.id)),
      });
      toast("Saved");
      onDone();
    } catch (e) {
      console.warn(LOG, e);
      toast("Could not save: " + e.message, true);
      setBusy(false);
    }
  };
  return (
    <div className="vbs-edit" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onDone(); } if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(); }}>
      <label className="vbs-edit-field"><span>Title</span>
        <input className="vbs-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
      </label>
      <label className="vbs-edit-field"><span>Date</span>
        <input className={"vbs-input" + (dateOk ? "" : " vbs-invalid")} placeholder="YYYY-MM-DD" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
      </label>
      <SafeBox message="Stash's pickers are not available"><Pickers draft={draft} set={set} /></SafeBox>
      <label className="vbs-edit-field"><span>Details</span>
        <textarea className="vbs-input" rows={4} value={draft.details} onChange={(e) => set({ details: e.target.value })} />
      </label>
      <div className="vbs-modal-actions">
        <span className="vbs-dim vbs-small">Ctrl + Enter saves</span><span className="vbs-grow" />
        <button type="button" className="vbs-button" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="button" className="vbs-button vbs-button-primary" onClick={save} disabled={busy || !dateOk}><Icons.Save /> Save</button>
      </div>
    </div>
  );
}
