// Settings panels that act immediately instead of through the settings
// draft: performance (per browser) and database optimization.

import { backend, syncRatings, findMissingIds, CATEGORY_BY_ID } from "./api.js";
import { PERF_OPTIONS, usePerformance } from "./perf.js";
import { ConfirmModal } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form } = PluginApi.libraries.Bootstrap;

const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`);

export function PerformancePanel() {
  const { mode, options, lowEnd, setMode, setOption } = usePerformance();
  return (
    <>
      <div className="vb-field">
        <label>Mode</label>
        <Form.Control as="select" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="auto">Auto ({lowEnd ? "low" : "high"} on this device)</option>
          <option value="high">High quality</option>
          <option value="low">Low-end device</option>
          <option value="custom">Custom</option>
        </Form.Control>
        <span className="vb-help">
          Saved in this browser only, so a phone can use lighter settings than a desktop. Auto picks "low" on devices
          with 4 or fewer CPU cores, little memory or reduced motion turned on.
        </span>
      </div>
      {Object.entries(PERF_OPTIONS).map(([key, o]) => (
        <div className="vb-field" key={key}>
          <label>{o.label}</label>
          <Form.Check type="switch" id={`vb-perf-${key}`} checked={!!options[key]} onChange={(e) => setOption(key, e.target.checked)} label="" />
          <span className="vb-help">{o.help}</span>
        </div>
      ))}
    </>
  );
}

export function DatabasePanel({ active, syncEnabled, notifyError, onDataChanged }) {
  const toast = PluginApi.hooks.useToast();
  const [info, setInfo] = React.useState(null);
  const [scan, setScan] = React.useState(null); // { running, done, total, missing: { cat: [ids] } }
  const [dropSkips, setDropSkips] = React.useState(false);
  const [keepBackups, setKeepBackups] = React.useState(5);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [last, setLast] = React.useState(null);

  const load = React.useCallback(() => {
    backend("db_info").then(setInfo).catch((e) => notifyError("Could not read database info", e));
  }, [notifyError]);
  React.useEffect(() => { if (active) load(); }, [active]);

  const runScan = async () => {
    const entries = Object.entries(info.ids).filter(([cat]) => CATEGORY_BY_ID[cat]);
    const total = entries.reduce((n, [, ids]) => n + ids.length, 0);
    let base = 0;
    const missing = {};
    setScan({ running: true, done: 0, total, missing });
    try {
      for (const [cat, ids] of entries) {
        const found = await findMissingIds(CATEGORY_BY_ID[cat], ids, (done) => setScan({ running: true, done: base + done, total, missing }));
        if (found.length) missing[cat] = found;
        base += ids.length;
      }
      setScan({ running: false, done: total, total, missing });
    } catch (e) {
      notifyError("Scan failed", e);
      setScan(null);
    }
  };

  const missingCount = scan && !scan.running ? Object.values(scan.missing).reduce((n, l) => n + l.length, 0) : 0;

  const run = async () => {
    setBusy(true);
    try {
      const removeItems = scan && !scan.running ? scan.missing : {};
      const out = await backend("compact", { removeItems, dropSkips, keepBackups });
      // Deleted items cannot be updated in Stash; only sync the others.
      const gone = new Set(Object.entries(removeItems).flatMap(([cat, ids]) => ids.map((id) => `${cat}:${id}`)));
      const changed = out.changed.filter((c) => !gone.has(`${c.category}:${c.id}`));
      if (syncEnabled && changed.length) await syncRatings(changed);
      setLast(out);
      toast.success(`Database optimized: ${kb(out.bytesBefore)} → ${kb(out.bytesAfter)}`);
      setScan(null);
      load();
      if (out.removedEntries) onDataChanged();
    } catch (e) {
      notifyError("Optimization failed", e);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (!info) return <p className="vb-muted">Loading…</p>;
  return (
    <>
      <div className="vb-dbinfo">
        <span>Data file <b>{kb(info.bytes)}</b></span>
        <span>Entries <b>{info.entries}</b> ({info.battles} battles, {info.skips} skips, {info.arenas} arena fights)</span>
        <span>Names <b>{info.names}</b>{info.orphanNames ? ` (${info.orphanNames} unused)` : ""}</span>
        <span>Backups <b>{info.backups.length}</b> · {kb(info.backupBytes)}</span>
      </div>

      <div className="vb-row">
        <Button variant="secondary" size="sm" disabled={scan?.running || !info.entries} onClick={runScan}>
          {scan?.running ? `Checking ${scan.done}/${scan.total}…` : "Find items deleted from Stash"}
        </Button>
        {scan && !scan.running && (
          <span className={missingCount ? "" : "vb-muted"}>
            {missingCount
              ? `${missingCount} deleted: ${Object.entries(scan.missing).map(([c, l]) => `${l.length} ${CATEGORY_BY_ID[c].label.toLowerCase()}`).join(", ")}. Their battles are removed when you optimize.`
              : "Every item still exists in Stash."}
          </span>
        )}
      </div>
      <div className="vb-field">
        <label>Remove skips</label>
        <Form.Check type="switch" id="vb-db-skips" checked={dropSkips} onChange={(e) => setDropSkips(e.target.checked)} label="" />
        <span className="vb-help">Skips do not affect ratings; removing them only resets the skip counters.</span>
      </div>
      <div className="vb-field">
        <label>Backups to keep</label>
        <Form.Control type="number" min={0} max={100} value={keepBackups} onChange={(e) => setKeepBackups(e.target.value === "" ? "" : Number(e.target.value))} />
        <span className="vb-help">Newest backups kept next to the data file, including the one made before optimizing.</span>
      </div>
      <div className="vb-row">
        <Button variant="primary" disabled={busy || keepBackups === ""} onClick={() => setConfirm(true)}>Optimize database</Button>
        <span className="vb-help">Rewrites the data file without unused names and the selected entries. A backup is made first.</span>
      </div>
      {last && (
        <p className="vb-muted vb-help">
          Last run: {kb(last.bytesBefore)} → {kb(last.bytesAfter)} · {last.removedEntries} entries, {last.removedNames} names
          and {last.removedBackups} backups removed{last.backup ? ` · backup ${last.backup}` : ""}.
        </p>
      )}

      <ConfirmModal show={confirm} title="Optimize the database?" confirmLabel="Optimize" variant="primary" busy={busy}
        onConfirm={run} onCancel={() => setConfirm(false)}>
        {missingCount ? `Battles of ${missingCount} deleted items are removed and the ratings recalculated. ` : ""}
        {dropSkips ? "Skip entries are removed. " : ""}
        Unused names are dropped and only the newest {keepBackups} backups are kept.
      </ConfirmModal>
    </>
  );
}
