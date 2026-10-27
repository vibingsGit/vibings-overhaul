// Settings tab: scoring, rating mapping, performer bonus, battle options,
// pairing, filters, arena, performance and maintenance (database, re-sync,
// resets).

import { backend, syncRatings, CATEGORIES } from "./api.js";
import { ConfirmModal } from "./ui.jsx";
import { StatusPanel } from "./StatusPanel.jsx";
import { FiltersEditor } from "./FiltersEditor.jsx";
import { PerformancePanel, DatabasePanel } from "./MaintenancePanels.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form } = PluginApi.libraries.Bootstrap;

const clone = (v) => JSON.parse(JSON.stringify(v));

const SECTIONS = [
  ["status", "Status"], ["scoring", "Scoring"], ["battle", "Battle"], ["filters", "Filters"],
  ["arena", "Arena"], ["performance", "Performance"], ["maintenance", "Maintenance"],
];
const sectionId = (id) => `vb-settings-${id}`;

/** Scroll the settings view to a section (e.g. "arena"). */
export function scrollToSettings(id) {
  setTimeout(() => document.getElementById(sectionId(id))?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function SelectField({ label, help, value, options, onChange }) {
  return (
    <div className="vb-field">
      <label>{label}</label>
      <Form.Control as="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </Form.Control>
      <span className="vb-help">{help}</span>
    </div>
  );
}

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
  const saveBar = (
    <div className="vb-row vb-savebar">
      <Button variant="primary" disabled={!dirty || saving} onClick={() => save()}>{saving ? "Saving…" : "Save settings"}</Button>
      <Button variant="secondary" disabled={!dirty || saving} onClick={() => setDraft(clone(settings))}>Discard changes</Button>
      {scoringChanged && <span className="vb-muted">Saving recalculates every rating from the battle history.</span>}
      {dirty && !scoringChanged && <span className="vb-muted">Unsaved changes</span>}
    </div>
  );

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
      <nav className="vb-settings-nav" aria-label="Settings sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => scrollToSettings(id)}>{label}</button>
        ))}
      </nav>

      <div id={sectionId("status")}><StatusPanel settings={settings} /></div>

      <fieldset id={sectionId("scoring")}>
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

      <fieldset id={sectionId("battle")}>
        <legend>Battle</legend>
        <CheckField label="Sync ratings to Stash" help="Write each item's rating to its Stash rating." checked={draft.ui.syncRatings !== false} onChange={set("ui", "syncRatings")} />
        <CheckField label="Auto continue" help="Show the next pair automatically. Off: the result stays until you press Next (Space / Enter)." checked={draft.ui.autoContinue !== false} onChange={set("ui", "autoContinue")} />
        <SelectField label="Battle animations" value={draft.ui.animations || "epic"} onChange={set("ui", "animations")}
          options={[["epic", "Epic"], ["subtle", "Subtle"], ["off", "Off"]]}
          help="Epic: winner stamp, crown, confetti, K.O. slash and a VS clash. Subtle: a short pop and colour. Effects can be limited per device under Performance." />
        <NumberField label="Result delay (ms)" help="How long the result is shown before the next pair (auto continue). Animations extend it to at least 0.5 s (subtle) or 1.1 s (epic)." value={draft.ui.resultDelayMs ?? 700} min={0} max={5000} step={100} onChange={set("ui", "resultDelayMs")} />
        <CheckField label="No duplicate performer" help="Scene, image and gallery battles never put the same performer on both sides." checked={draft.pairing.noDuplicatePerformer} onChange={set("pairing", "noDuplicatePerformer")} />
      </fieldset>

      <fieldset id={sectionId("filters")}>
        <legend>Blacklist &amp; whitelist</legend>
        <FiltersEditor filters={draft.filters} onChange={(filters) => setDraft((d) => ({ ...d, filters }))} />
      </fieldset>

      <fieldset id={sectionId("arena")}>
        <legend>Arena</legend>
        <NumberField label="Fighters" help="Performers per arena fight (2–32)." value={draft.arena.fighters} min={2} max={32} onChange={set("arena", "fighters")} />
        <SelectField label="Fighter selection" value={draft.arena.selection} onChange={set("arena", "selection")}
          options={[["random", "Random performers"], ["top", "Top rated"], ["close", "Similar Elo"]]}
          help="Random: any performer, ranked or not. Top rated: drawn from the best ranked performers. Similar Elo: performers close to each other in rating. The performer blacklist/whitelist applies." />
        <NumberField label="Win bonus (Elo)" help="Elo the winner gains." value={draft.arena.winBonus} min={0} max={400} onChange={set("arena", "winBonus")} />
        <NumberField label="Loss penalty (Elo)" help="Elo the first knocked out loses; later placements lose proportionally less (the runner-up the least)." value={draft.arena.lossPenalty} min={0} max={400} onChange={set("arena", "lossPenalty")} />
        <NumberField label="Elo influence %" help="How much Elo affects strength. 0 = pure luck, 100 = a fighter 400 Elo above average hits about 3x as hard." value={draft.arena.eloInfluence} min={0} max={100} step={5} onChange={set("arena", "eloInfluence")} />
        <SelectField label="Default speed" value={String(draft.arena.speed)} onChange={(v) => set("arena", "speed")(Number(v))}
          options={[["1", "1x"], ["2", "2x"], ["4", "4x"]]} help="Playback speed when a fight starts; it can be changed during the fight." />
        <CheckField label="Record results" help="Off: fights are exhibitions and ratings are not changed." checked={draft.arena.record} onChange={set("arena", "record")} />
      </fieldset>

      {saveBar}

      <fieldset id={sectionId("performance")} style={{ marginTop: 24 }}>
        <legend>Performance (this device)</legend>
        <PerformancePanel />
      </fieldset>

      <fieldset id={sectionId("maintenance")}>
        <legend>Database</legend>
        <DatabasePanel active={active} syncEnabled={syncEnabled} notifyError={notifyError} onDataChanged={onDataChanged} />
      </fieldset>

      <fieldset>
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
