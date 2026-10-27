// Settings → Tools → Vibings Overhaul → Vibings Scene Heatmap.

import { LOG, graphql, backend, fmtBytes, fmtDuration, timeAgo } from "./api.js";
import { useSettings, saveSettings, loadSettings } from "./settings.js";
import { forgetHeat } from "./store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form, Table, Alert } = PluginApi.libraries.Bootstrap;

function Toggle({ id, label, help, checked, onChange }) {
  return (
    <Form.Group className="vsh-tool-toggle">
      <Form.Check type="switch" id={id} label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {help && <Form.Text className="text-muted">{help}</Form.Text>}
    </Form.Group>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

export function ToolsPanel() {
  const s = useSettings();
  const [info, setInfo] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [message, setMessage] = React.useState(null);
  const [importMode, setImportMode] = React.useState("merge");
  const [keepBackups, setKeepBackups] = React.useState("");
  const [confirmReset, setConfirmReset] = React.useState(false);
  const fileRef = React.useRef(null);

  const refresh = React.useCallback(async () => {
    try { setInfo(await backend("db_info")); } catch (e) { setMessage({ variant: "danger", text: e.message }); }
  }, []);
  React.useEffect(() => { loadSettings(); refresh(); }, [refresh]);

  const run = async (name, fn) => {
    setBusy(name);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ variant: "success", text });
    } catch (e) {
      console.warn(LOG, e);
      setMessage({ variant: "danger", text: e.message || String(e) });
    } finally {
      setBusy(null);
      if (name !== "settings" && name !== "export") forgetHeat();
      refresh();
    }
  };
  const save = (partial) => run("settings", async () => { await saveSettings(partial); });
  const b = s.backup;
  const c = info?.counts;

  return (
    <div className="vsh-tools">
      {message && <Alert variant={message.variant} onClose={() => setMessage(null)} dismissible>{message.text}</Alert>}
      <div className="vsh-tool-section">
        <h6>Recording</h6>
        <Toggle id="vsh-enabled" label="Record the watched parts of videos" checked={s.enabled}
          help="Only parts that really play count; skipped parts stay low and rewatched parts rise." onChange={(v) => save({ enabled: v })} />
        <p className="text-muted">{c ? `${fmtDuration(c.seconds)} watched on ${c.scenes} scenes · ${fmtBytes(info.bytes)}` : "Loading…"}</p>
      </div>
      <div className="vsh-tool-section">
        <h6>Curve</h6>
        <Toggle id="vsh-native" label="Show on Stash's own player" checked={s.native} onChange={(v) => save({ native: v })}
          help="Vibings Better Scenes shows it on its own timeline (its timeline settings)." />
        <div className="vsh-tool-row">
          <Form.Label htmlFor="vsh-show" className="mb-0">Show</Form.Label>
          <Form.Control id="vsh-show" as="select" size="sm" className="vsh-tool-select" value={s.show} onChange={(e) => save({ show: e.target.value })}>
            <option value="hover">While the pointer is on the timeline</option>
            <option value="always">Always</option>
          </Form.Control>
          <Form.Label htmlFor="vsh-height" className="mb-0">Height</Form.Label>
          <Form.Control id="vsh-height" size="sm" type="number" min={12} max={80} className="vsh-tool-num" defaultValue={s.height} key={"h" + s.height}
            onBlur={(e) => Number(e.target.value) !== s.height && save({ height: Number(e.target.value) })} />
          <span>px, smoothing</span>
          <Form.Control id="vsh-smooth" size="sm" type="number" min={0} max={10} className="vsh-tool-num" defaultValue={s.smoothing} key={"s" + s.smoothing}
            aria-label="Smoothing" onBlur={(e) => Number(e.target.value) !== s.smoothing && save({ smoothing: Number(e.target.value) })} />
        </div>
      </div>
      <div className="vsh-tool-section">
        <h6>Data</h6>
        <div className="vsh-tool-row">
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("export", async () => {
            download(`vibings-scene-heatmap-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await backend("export")));
            return "Export downloaded.";
          })}>Export</Button>
          <Form.Control as="select" size="sm" value={importMode} onChange={(e) => setImportMode(e.target.value)} className="vsh-tool-select" aria-label="Import mode">
            <option value="merge">Add to current data</option>
            <option value="replace">Replace current data</option>
          </Form.Control>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>Import…</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            run("import", async () => {
              let data;
              try { data = JSON.parse(await file.text()); } catch { throw new Error("The file is not valid JSON."); }
              const out = await backend("import", { data, mode: importMode });
              return `Imported ${out.scenes} scenes. The previous data was backed up.`;
            });
          }} />
        </div>
      </div>
      <div className="vsh-tool-section">
        <h6>Backups</h6>
        <Toggle id="vsh-auto-backup" label="Automatic backups" checked={b.auto} help="Before a change, at most once per interval." onChange={(v) => save({ backup: { auto: v } })} />
        <div className="vsh-tool-row">
          <Form.Label htmlFor="vsh-interval" className="mb-0">Every</Form.Label>
          <Form.Control id="vsh-interval" size="sm" type="number" min={1} max={720} className="vsh-tool-num" defaultValue={b.intervalHours} key={"i" + b.intervalHours}
            onBlur={(e) => Number(e.target.value) !== b.intervalHours && save({ backup: { intervalHours: Number(e.target.value) } })} />
          <span>hours, keep</span>
          <Form.Control id="vsh-keep" size="sm" type="number" min={1} max={100} className="vsh-tool-num" defaultValue={b.keep} key={"k" + b.keep} aria-label="Automatic backups to keep"
            onBlur={(e) => Number(e.target.value) !== b.keep && save({ backup: { keep: Number(e.target.value) } })} />
          <span>automatic backups</span>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("backup", async () => `Backup ${(await backend("backup_now")).backup} made.`)}>Back up now</Button>
        </div>
        {info?.backups?.length ? (
          <Table size="sm" className="vsh-tool-table">
            <tbody>
              {info.backups.map((bk) => (
                <tr key={bk.name}>
                  <td>{bk.tag}</td>
                  <td>{timeAgo(bk.mtime * 1000)}</td>
                  <td className="text-muted">{new Date(bk.mtime * 1000).toLocaleString()}</td>
                  <td className="text-right">{fmtBytes(bk.bytes)}</td>
                  <td className="text-right vsh-nowrap">
                    <Button size="sm" variant="secondary" disabled={!!busy || bk.tag === "corrupt"} onClick={() => run("restore", async () => {
                      const out = await backend("restore_backup", { name: bk.name });
                      return `Restored ${out.restored}. The data before it was backed up as ${out.backup}.`;
                    })}>Restore</Button>{" "}
                    <Button size="sm" variant="minimal" className="vsh-danger" disabled={!!busy} onClick={() => run("delete", async () => { await backend("delete_backup", { name: bk.name }); })}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-muted">No backups yet.</p>}
      </div>
      <div className="vsh-tool-section">
        <h6>Optimise database</h6>
        <p className="text-muted">Removes the data of deleted scenes and empty rows and rewrites the file compactly. A backup is made first.</p>
        <div className="vsh-tool-row">
          <Form.Label htmlFor="vsh-keep-all" className="mb-0">Keep newest</Form.Label>
          <Form.Control id="vsh-keep-all" size="sm" type="number" min={0} placeholder="all" className="vsh-tool-num" value={keepBackups} onChange={(e) => setKeepBackups(e.target.value)} />
          <span>backups</span>
          <Button size="sm" variant="primary" disabled={!!busy || !info} onClick={() => run("compact", async () => {
            const found = new Set();
            for (const part of chunks(info.ids.map(Number), 200)) {
              const d = await graphql("query VibingsSceneHeatmapIds($ids: [Int!]) { findScenes(scene_ids: $ids, filter: { per_page: -1 }) { scenes { id } } }", { ids: part });
              d.findScenes.scenes.forEach((x) => found.add(String(x.id)));
            }
            const existing = Object.fromEntries(info.ids.map((id) => [id, found.has(id)]));
            const out = await backend("compact", { existing, ...(keepBackups !== "" ? { keepBackups: Number(keepBackups) } : {}) });
            return `Optimised: ${fmtBytes(out.bytesBefore)} → ${fmtBytes(out.bytesAfter)}, removed ${out.removedRows} rows and ${out.removedBackups} backups.`;
          })}>{busy === "compact" ? "Optimising…" : "Optimise"}</Button>
        </div>
      </div>
      <div className="vsh-tool-section">
        <h6>Reset</h6>
        {!confirmReset ? (
          <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setConfirmReset(true)}>Forget all watched parts…</Button>
        ) : (
          <div className="vsh-tool-row">
            <span>Forget the watched parts of every scene? A backup is made first.</span>
            <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("reset", async () => { setConfirmReset(false); await backend("reset", { confirm: true }); return "All watched parts forgotten."; })}>Forget</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}
