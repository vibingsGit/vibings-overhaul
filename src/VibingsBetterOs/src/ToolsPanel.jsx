// Settings → Tools → Vibings Overhaul → Vibings Better Os: options, import /
// export, backups and database optimisation.

import { LOG, graphql, backend, fmtBytes, timeAgo } from "./api.js";
import { useSettings, saveSettings, loadSettings } from "./settings.js";
import { forgetScenes } from "./store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form, Table, Alert } = PluginApi.libraries.Bootstrap;

function Toggle({ id, label, help, checked, onChange }) {
  return (
    <Form.Group className="vbo-tool-toggle">
      <Form.Check type="switch" id={id} label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {help && <Form.Text className="text-muted">{help}</Form.Text>}
    </Form.Group>
  );
}

function Section({ title, children }) {
  return (
    <div className="vbo-tool-section">
      <h6>{title}</h6>
      {children}
    </div>
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

/** Stash's current o_history / o_counter for every item that has details (null = deleted). */
async function stashState(ids) {
  const scenes = Object.fromEntries(ids.scenes.map((id) => [id, null]));
  const images = Object.fromEntries(ids.images.map((id) => [id, null]));
  for (const part of chunks(ids.scenes.map(Number), 200)) {
    const d = await graphql("query VibingsBetterOsCompactScenes($ids: [Int!]) { findScenes(scene_ids: $ids, filter: { per_page: -1 }) { scenes { id o_history } } }", { ids: part });
    for (const s of d.findScenes.scenes) scenes[s.id] = s.o_history || [];
  }
  for (const part of chunks(ids.images.map(Number), 200)) {
    const d = await graphql("query VibingsBetterOsCompactImages($ids: [Int!]) { findImages(image_ids: $ids, filter: { per_page: -1 }) { images { id o_counter } } }", { ids: part });
    for (const i of d.findImages.images) images[i.id] = i.o_counter || 0;
  }
  return { scenes, images };
}

export function ToolsPanel() {
  const settings = useSettings();
  const [info, setInfo] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [message, setMessage] = React.useState(null); // { variant, text }
  const [importMode, setImportMode] = React.useState("merge");
  const [importSettings, setImportSettings] = React.useState(false);
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
      if (name !== "settings" && name !== "export") forgetScenes();
      refresh();
    }
  };
  const save = (partial) => run("settings", async () => { await saveSettings(partial); });

  const c = info?.counts;
  const b = settings.backup;

  return (
    <div className="vbo-tools">
      {message && <Alert variant={message.variant} onClose={() => setMessage(null)} dismissible>{message.text}</Alert>}

      <Section title="Recording">
        <Toggle id="vbo-record-position" label="Store the video position of scene Os" checked={settings.recordPosition}
          help="An O added while a scene plays, with any O button, keeps the moment of the video."
          onChange={(v) => save({ recordPosition: v })} />
        <Toggle id="vbo-image-sessions" label="Store image viewing time" checked={settings.imageSessions}
          help="An image O keeps how long the image had been open (lightbox or image page)."
          onChange={(v) => save({ imageSessions: v })} />
      </Section>

      <Section title="Video player">
        <Toggle id="vbo-player-button" label="O button in the player" checked={settings.player.button}
          onChange={(v) => save({ player: { button: v } })} />
        <Toggle id="vbo-player-markers" label="O markers on the timeline" checked={settings.player.markers}
          onChange={(v) => save({ player: { markers: v } })} />
        <Toggle id="vbo-player-popup" label="Pop-up when an O is added" checked={settings.player.popup}
          onChange={(v) => save({ player: { popup: v } })} />
      </Section>

      <Section title="Data">
        <p className="vbo-tool-stats">
          {c ? (
            <>
              {c.sceneOs} scene Os on {c.scenes} scenes ({c.timedOs} with position) · {c.imageOs} image Os on {c.images} images
              ({c.sessionOs} with viewing time) · {fmtBytes(info.bytes)}
            </>
          ) : "Loading…"}
        </p>
        <div className="vbo-tool-row">
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("export", async () => {
            const data = await backend("export");
            download(`vibings-better-os-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
            return "Export downloaded.";
          })}>Export</Button>
          <Form.Control as="select" size="sm" value={importMode} onChange={(e) => setImportMode(e.target.value)}
            className="vbo-tool-select" aria-label="Import mode">
            <option value="merge">Merge with current data</option>
            <option value="replace">Replace current data</option>
          </Form.Control>
          <Form.Check type="checkbox" id="vbo-import-settings" label="Also import settings" checked={importSettings}
            onChange={(e) => setImportSettings(e.target.checked)} />
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => fileRef.current?.click()}>Import…</Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            run("import", async () => {
              let data;
              try { data = JSON.parse(await file.text()); } catch { throw new Error("The file is not valid JSON."); }
              const out = await backend("import", { data, mode: importMode, withSettings: importSettings });
              if (importSettings) await loadSettings();
              return `Imported: ${out.added} new, ${out.updated} updated. The previous data was backed up.`;
            });
          }} />
        </div>
        <Form.Text className="text-muted">
          Imports Vibings Better Os exports and older O-timestamp files. Details of Os that no longer exist in Stash
          are removed when their scene is opened or the database is optimised.
        </Form.Text>
      </Section>

      <Section title="Backups">
        <Toggle id="vbo-auto-backup" label="Automatic backups" checked={b.auto}
          help="Before a change, at most once per interval." onChange={(v) => save({ backup: { auto: v } })} />
        <div className="vbo-tool-row">
          <Form.Label htmlFor="vbo-interval" className="mb-0">Every</Form.Label>
          <Form.Control id="vbo-interval" size="sm" type="number" min={1} max={720} className="vbo-tool-num"
            defaultValue={b.intervalHours} key={"i" + b.intervalHours}
            onBlur={(e) => Number(e.target.value) !== b.intervalHours && save({ backup: { intervalHours: Number(e.target.value) } })} />
          <span>hours, keep</span>
          <Form.Control id="vbo-keep" size="sm" type="number" min={1} max={100} className="vbo-tool-num"
            defaultValue={b.keep} key={"k" + b.keep} aria-label="Automatic backups to keep"
            onBlur={(e) => Number(e.target.value) !== b.keep && save({ backup: { keep: Number(e.target.value) } })} />
          <span>automatic backups</span>
          <Button size="sm" variant="secondary" disabled={!!busy}
            onClick={() => run("backup", async () => `Backup ${(await backend("backup_now")).backup} made.`)}>Back up now</Button>
        </div>
        {info?.backups?.length ? (
          <Table size="sm" className="vbo-tool-table">
            <tbody>
              {info.backups.map((bk) => (
                <tr key={bk.name}>
                  <td>{bk.tag}</td>
                  <td>{timeAgo(bk.mtime * 1000)}</td>
                  <td className="text-muted">{new Date(bk.mtime * 1000).toLocaleString()}</td>
                  <td className="text-right">{fmtBytes(bk.bytes)}</td>
                  <td className="text-right vbo-nowrap">
                    <Button size="sm" variant="secondary" disabled={!!busy || bk.tag === "corrupt"}
                      onClick={() => run("restore", async () => {
                        const out = await backend("restore_backup", { name: bk.name });
                        return `Restored ${out.restored}. The data before it was backed up as ${out.backup}.`;
                      })}>Restore</Button>{" "}
                    <Button size="sm" variant="minimal" className="vbo-danger" disabled={!!busy} title="Delete backup"
                      onClick={() => run("delete", async () => { await backend("delete_backup", { name: bk.name }); })}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-muted">No backups yet.</p>}
        {info && <Form.Text className="text-muted">Backups use {fmtBytes(info.backupBytes)}.</Form.Text>}
      </Section>

      <Section title="Optimise database">
        <p className="text-muted">
          Checks every stored detail against Stash: removes details of deleted scenes and images and of Os that were
          removed, merges duplicates and rewrites the file compactly. A backup is made first.
        </p>
        <div className="vbo-tool-row">
          <Form.Label htmlFor="vbo-keep-all" className="mb-0">Keep newest</Form.Label>
          <Form.Control id="vbo-keep-all" size="sm" type="number" min={0} placeholder="all" className="vbo-tool-num"
            value={keepBackups} onChange={(e) => setKeepBackups(e.target.value)} />
          <span>backups</span>
          <Button size="sm" variant="primary" disabled={!!busy || !info} onClick={() => run("compact", async () => {
            const stash = await stashState(info.ids);
            const out = await backend("compact", { stash, ...(keepBackups !== "" ? { keepBackups: Number(keepBackups) } : {}) });
            return `Optimised: ${fmtBytes(out.bytesBefore)} → ${fmtBytes(out.bytesAfter)}, removed ${out.removedOs} details` +
              ` (${out.removedItems} deleted items) and ${out.removedBackups} backups.`;
          })}>{busy === "compact" ? "Optimising…" : "Optimise"}</Button>
        </div>
      </Section>

      <Section title="Reset">
        {!confirmReset ? (
          <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setConfirmReset(true)}>Forget all details…</Button>
        ) : (
          <div className="vbo-tool-row">
            <span>Forget every stored position and viewing time? Stash's O counts stay. A backup is made first.</span>
            <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("reset", async () => {
              setConfirmReset(false);
              await backend("reset", { confirm: true });
              return "All details forgotten. Os are now classic Os.";
            })}>Forget</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        )}
      </Section>
    </div>
  );
}
