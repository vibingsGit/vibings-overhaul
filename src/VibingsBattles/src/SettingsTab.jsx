// Settings tab: scoring, rating mapping, performer bonus, battle options,
// and maintenance (full re-sync, resets).

import { backend, syncRatings, CATEGORIES } from "./api.js";
import { ConfirmModal } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form } = PluginApi.libraries.Bootstrap;

const clone = (v) => JSON.parse(JSON.stringify(v));

function NumberField({ label, help, value, min, max, step = 1, onChange }) {
  return (
    <div className="vb-field">
      <label>{label}</label>
      <Form.Control type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
      <span className="vb-help">{help}</span>
    </div>
  );
}

function CheckField({ label, help, checked, onChange }) {
  return (
    <div className="vb-field">
      <label>{label}</label>
      <Form.Check type="switch" id={`vb-${label}`} checked={!!checked} onChange={(e) => onChange(e.target.checked)} label="" />
      <span className="vb-help">{help}</span>
    </div>
  );
}

export function SettingsTab({ active, settings, saveSettings, syncEnabled, notifyError, onDataChanged }) {
  const toast = PluginApi.hooks.useToast();
  const [draft, setDraft] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [resetCat, setResetCat] = React.useState("scenes");
  const [confirm, setConfirm] = React.useState(null); // "category" | "all"
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (settings) setDraft(clone(settings)); }, [settings]);

  if (!active) return null;
  if (!draft) return <div className="vb-status vb-muted">Loading…</div>;

  const set = (section, key) => (value) => setDraft((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const scoringChanged =
    JSON.stringify([draft.elo, draft.ratingMap, draft.performerBonus]) !==
    JSON.stringify([settings.elo, settings.ratingMap, settings.performerBonus]);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(draft);
    } finally {
      setSaving(false);
    }
  };

  const resyncAll = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const rows = await backend("ratings");
      const n = await syncRatings(rows, (done, total) => setProgress({ done, total }));
      toast.success(`Synced ${n} ratings to Stash`);
    } catch (e) {
      notifyError("Re-sync failed", e);
    } finally {
      setProgress(null);
    }
  };

  const runReset = async () => {
    setBusy(true);
    try {
      const out = await backend("reset", confirm === "category" ? { category: resetCat } : {});
      if (syncEnabled && out.changed.length) await syncRatings(out.changed);
      toast.success(`Reset done. Backup: ${out.backup || "none (no data)"}`);
      onDataChanged();
    } catch (e) {
      notifyError("Reset failed", e);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const catLabel = CATEGORIES.find((c) => c.id === resetCat)?.label;

  return (
    <div className="vb-form">
      <fieldset>
        <legend>Scoring (Elo)</legend>
        <NumberField label="Starting rating" help="Elo of an item before its first battle." value={draft.elo.initial} min={100} max={5000} onChange={set("elo", "initial")} />
        <NumberField label="K-factor" help="How much one battle moves the ratings." value={draft.elo.k} min={1} max={200} onChange={set("elo", "k")} />
        <NumberField label="Provisional K-factor" help="Larger K for new items so they find their place quickly." value={draft.elo.provisionalK} min={1} max={400} onChange={set("elo", "provisionalK")} />
        <NumberField label="Provisional battles" help="How many battles an item counts as new." value={draft.elo.provisionalBattles} min={0} max={100} onChange={set("elo", "provisionalBattles")} />
      </fieldset>

      <fieldset>
        <legend>Stash rating</legend>
        <div className="vb-field">
          <label>Mapping</label>
          <Form.Control as="select" value={draft.ratingMap.mode} onChange={(e) => set("ratingMap", "mode")(e.target.value)}>
            <option value="linear">Linear</option>
            <option value="percentile">Rank (percentile)</option>
          </Form.Control>
          <span className="vb-help">
            Linear: 50 + (Elo − start) / scale. Rank: spreads items evenly over 1–100 within the category, so every battle can move many ratings.
          </span>
        </div>
        {draft.ratingMap.mode === "linear" && (
          <NumberField label="Scale" help="Elo points per rating point. Smaller = wider spread." value={draft.ratingMap.scale} min={1} max={100} onChange={set("ratingMap", "scale")} />
        )}
      </fieldset>

      <fieldset>
        <legend>Performer bonus</legend>
        <CheckField label="Enabled" help="Scene and image battles also move the performers' Elo." checked={draft.performerBonus.enabled} onChange={set("performerBonus", "enabled")} />
        <NumberField label="Winner bonus %" help="Share of the winning item's Elo gain given to its performers." value={draft.performerBonus.winnerPct} min={0} max={100} onChange={set("performerBonus", "winnerPct")} />
        <NumberField label="Loser penalty %" help="Share of the losing item's Elo loss applied to its performers." value={draft.performerBonus.loserPct} min={0} max={100} onChange={set("performerBonus", "loserPct")} />
      </fieldset>

      <fieldset>
        <legend>Battle</legend>
        <CheckField label="Sync ratings to Stash" help="Write each item's rating to its Stash rating." checked={draft.ui.syncRatings !== false} onChange={set("ui", "syncRatings")} />
        <NumberField label="Result delay (ms)" help="How long the result is shown before the next pair." value={draft.ui.resultDelayMs ?? 700} min={0} max={5000} step={100} onChange={set("ui", "resultDelayMs")} />
      </fieldset>

      <div className="vb-row">
        <Button variant="primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save settings"}</Button>
        <Button variant="secondary" disabled={!dirty || saving} onClick={() => setDraft(clone(settings))}>Discard changes</Button>
        {scoringChanged && <span className="vb-muted">Saving recalculates every rating from the battle history.</span>}
      </div>

      <fieldset style={{ marginTop: 24 }}>
        <legend>Maintenance</legend>
        <div className="vb-row">
          <Button variant="secondary" disabled={!!progress} onClick={resyncAll}>
            {progress ? `Syncing ${progress.done}/${progress.total}…` : "Re-sync all ratings to Stash"}
          </Button>
          <span className="vb-help">Writes every ranked item's rating to Stash, e.g. after editing ratings by hand.</span>
        </div>
      </fieldset>

      <fieldset className="vb-danger">
        <legend>Danger zone</legend>
        <div className="vb-row">
          <Form.Control as="select" value={resetCat} onChange={(e) => setResetCat(e.target.value)} style={{ width: "auto" }}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Form.Control>
          <Button variant="outline-danger" onClick={() => setConfirm("category")}>Reset category</Button>
          <Button variant="danger" onClick={() => setConfirm("all")}>Reset everything</Button>
        </div>
        <span className="vb-help">A backup of the data file is made before every reset. Settings are kept.</span>
      </fieldset>

      <ConfirmModal
        show={!!confirm}
        title={confirm === "all" ? "Reset all battles?" : `Reset ${catLabel}?`}
        confirmLabel="Reset"
        busy={busy}
        onConfirm={runReset}
        onCancel={() => setConfirm(null)}
      >
        {confirm === "all"
          ? "Deletes the whole battle history."
          : `Deletes every ${catLabel?.toLowerCase()} battle.`}{" "}
        {syncEnabled ? "The affected Stash ratings are cleared." : "Stash ratings are not touched (sync is off)."}
      </ConfirmModal>
    </div>
  );
}
